// Dynamic reprice engine — the orchestrator. Wires the two moving parts (reward model →
// bandit) through deterministic guardrails and narration, and logs every outcome as a
// training row. The on-screen price is fully reproducible: model predicts per-arm reward,
// the bandit picks an arm, guardrails clamp it, the LLM only describes it.
//
// This is the RE-pricing loop (an already-listed item reacting to market events) — it is
// separate from the one-shot sell-flow PricingService in this same folder.

import { randomUUID } from 'node:crypto';
import type {
  BanditState,
  DemandEvent,
  PriceArm,
  PricingDecision,
  PricingOutcome,
  PricingStateVector,
} from '@reloop/shared';
import { applyGuardrails, computeReward, DEFAULT_REWARD_CONFIG } from '@reloop/shared';
import type { RewardModel } from './reward-model.js';
import { RepriceBandit } from './reprice-bandit.js';
import { reasonCodeFor } from './reprice-events.js';
import { narrateDecision, type Completer } from './reprice-narrate.js';
import { resolveGeoPricingFeatures } from './geo-features.js';
import { getSeasonalityIndex } from '../../lib/seasonality.js';
import { getListingEngagement } from '../listingEvents.js';
import { logPricingTransaction } from './production-log.js';
import { log } from '../../lib/logger.js';

const GRADE_ORDINAL: Record<PricingStateVector['gradeKey'], number> = {
  new: 5,
  'like-new': 4,
  good: 3,
  fair: 2,
  poor: 1,
};

// Fresh logged outcomes between offline retrains (spec 014). Mirrors ml/pricing RETRAIN_EVERY.
const RETRAIN_EVERY = 500;

/** Minimum fields a caller must supply; everything else is defaulted. */
export interface RepriceRequest {
  listingId: string;
  event: DemandEvent;
  /** The listing's real current price (₹). Lets step-caps work per call instead of
   *  relying on the engine's in-memory last decision. Falls back to that, then anchor. */
  currentPrice?: number;
  /** Request metadata (not part of the feature vector itself) letting the engine
   *  resolve REAL geo/local features (spec 024) instead of the flat placeholder
   *  defaults in fillState() below. Either is optional and either may miss — the
   *  placeholders remain the safety net when neither resolves anything. */
  pincode?: string;
  returnId?: string;
  state: Partial<PricingStateVector> &
    Pick<PricingStateVector, 'category' | 'gradeKey' | 'compMedianPrice' | 'amazonNewPrice' | 'sellerFloor' | 'routeElsewhereValue'>;
}

/** Fill a partial state with safe defaults so the feature vector is always complete. */
function fillState(s: RepriceRequest['state']): PricingStateVector {
  const comp = s.compMedianPrice;
  return {
    category: s.category,
    categoryL1: s.categoryL1 ?? s.category,
    categoryL2: s.categoryL2 ?? 'unknown',
    brand: s.brand ?? 'unknown',
    gradeKey: s.gradeKey,
    gradeOrdinal: s.gradeOrdinal ?? GRADE_ORDINAL[s.gradeKey],
    originalPriceLog: s.originalPriceLog ?? Math.log1p(comp * 1.4),
    itemAgeDays: s.itemAgeDays ?? 365,
    hasAccessories: s.hasAccessories ?? false,
    authenticityScore: s.authenticityScore ?? 0.9,
    damageScore: s.damageScore ?? 0.1,
    defectCount: s.defectCount ?? 0,
    daysOnMarket: s.daysOnMarket ?? 0,
    numReprices: s.numReprices ?? 0,
    currentDiscountPct: s.currentDiscountPct ?? 0,
    deadlinePressure: s.deadlinePressure ?? 1,
    viewVelocity24h: s.viewVelocity24h ?? 5,
    viewVelocityTrend: s.viewVelocityTrend ?? 1,
    saveRate: s.saveRate ?? 0,
    ctr: s.ctr ?? 0.05,
    messageCount: s.messageCount ?? 0,
    cartAbandons: s.cartAbandons ?? 0,
    compCountNearby: s.compCountNearby ?? 3,
    compMedianPrice: comp,
    compMinPrice: s.compMinPrice ?? comp * 0.85,
    compSoldLast7d: s.compSoldLast7d ?? 2,
    compAvgDaysToSell: s.compAvgDaysToSell ?? 8,
    amazonNewPrice: s.amazonNewPrice,
    nearbyBuyerCount: s.nearbyBuyerCount ?? 5,
    localSupplyCount: s.localSupplyCount ?? 3,
    geoDemandIndex: s.geoDemandIndex ?? 0.5,
    sellerFloor: s.sellerFloor,
    routeElsewhereValue: s.routeElsewhereValue,
    dayOfWeekSin: s.dayOfWeekSin ?? 0,
    dayOfWeekCos: s.dayOfWeekCos ?? 1,
    hourOfDaySin: s.hourOfDaySin ?? 0,
    hourOfDayCos: s.hourOfDayCos ?? 1,
    // Real calendar-driven signal (spec 024, phase 2) — no Mongo dependency,
    // unlike the geo/local group above, so it's always computed, never a flat
    // placeholder.
    seasonalityIndex: s.seasonalityIndex ?? getSeasonalityIndex(s.category),
  };
}

interface LastDecision {
  bucket: { category: string; gradeKey: string };
  finalPrice: number;
  decisionId: string;
  arm: PriceArm;
  /** The full feature vector this decision used — kept so logOutcome() can
   *  persist a real (state, arm, reward) row for offline retraining (spec
   *  024, phase 7), not just the bucket. */
  state: PricingStateVector;
}

export class RepriceEngine {
  private readonly bandit = new RepriceBandit();
  private readonly lastByListing = new Map<string, LastDecision>();
  private readonly outcomeLog: Array<PricingOutcome & { reward: number }> = [];

  constructor(
    private readonly model: RewardModel,
    private readonly modelVersion: string,
    private readonly llm?: Completer,
  ) {}

  async decide(req: RepriceRequest): Promise<PricingDecision> {
    const [geo, engagement] = await Promise.all([
      resolveGeoPricingFeatures({
        pincode: req.pincode,
        returnId: req.returnId,
        category: req.state.category,
      }),
      getListingEngagement(req.listingId),
    ]);
    const { regionCluster, ...geoFeatures } = geo;
    const state = fillState({ ...req.state, ...geoFeatures, ...engagement });
    // Region cluster pools bandit posteriors as a third dimension when resolved
    // (spec 024, phase 8); it's request metadata, not a PricingStateVector feature.
    const bucket = { category: state.category, gradeKey: state.gradeKey, regionCluster };
    const anchor = state.compMedianPrice;
    const floor = Math.max(state.sellerFloor, state.routeElsewhereValue);
    const ceiling = state.amazonNewPrice * 0.95;

    const prior = this.lastByListing.get(req.listingId);
    // If the caller tells us the current price, this is a reprice, not a first listing
    // (so the per-step cap applies) — unless the event itself is the initial listing, or
    // a seller-approved markdown (spec 023: a deliberate seller decision should land in
    // one step too, not get clamped by the ±₹100/8% guardrail meant for algorithmic moves).
    const isFirstListing =
      req.event.type === 'initial_listing' ||
      req.event.type === 'seller_markdown' ||
      (req.currentPrice === undefined && !prior && state.numReprices === 0);
    const currentPrice = req.currentPrice ?? prior?.finalPrice ?? anchor;

    const { rewards, curve } = await this.model.predict(state, anchor);
    const choice = this.bandit.decide(bucket, rewards, anchor, floor, ceiling);
    // The bandit/model still run (for telemetry + bandit-update continuity) even when
    // a seller markdown overrides the chosen price outright.
    const approvedPrice = req.event.payload['approvedPrice'];
    const rawPrice =
      req.event.type === 'seller_markdown' && typeof approvedPrice === 'number'
        ? approvedPrice
        : anchor * choice.chosenArm;
    const guard = applyGuardrails({ proposedPrice: rawPrice, currentPrice, state, isFirstListing });

    const decision: PricingDecision = {
      listingId: req.listingId,
      anchorPrice: anchor,
      chosenArm: choice.chosenArm,
      rawPrice,
      finalPrice: guard.finalPrice,
      floor,
      ceiling: state.amazonNewPrice,
      predictedRewards: rewards,
      expectedMargin: guard.finalPrice - DEFAULT_REWARD_CONFIG.handlingCost,
      sellThroughCurve: curve,
      reason: '',
      reasonCode: reasonCodeFor(req.event.type),
      triggeredBy: req.event.type,
      modelVersion: this.modelVersion,
      timestamp: new Date().toISOString(),
      guardrailsApplied: guard.guardrailsApplied,
      geoDemandIndex: state.geoDemandIndex,
      stateUsed: state,
      sampledScores: choice.sampledScores,
    };
    if (guard.shouldReroute) {
      decision.reason = `Below floor ₹${floor} — handing off to the Intelligent Bridge to reroute.`;
    } else {
      const narrateStart = Date.now();
      const narrated = await narrateDecision(decision, this.llm, {
        name: 'pricing.narrate',
        listingId: req.listingId,
        returnId: req.returnId,
      });
      decision.reason = narrated.text;
      decision.narrationModelMeta = {
        model: this.llm?.modelName ?? 'template',
        usedFallback: narrated.usedFallback,
        latencyMs: Date.now() - narrateStart,
      };
    }

    this.lastByListing.set(req.listingId, {
      bucket,
      finalPrice: guard.finalPrice,
      decisionId: randomUUID(),
      arm: choice.chosenArm,
      state,
    });

    // Structured "thinking" log — one JSON line per decision. On AWS this lands in
    // CloudWatch verbatim, so every reprice is auditable: what the model saw, what it
    // predicted per arm, which arm the bandit chose, and which guardrails fired.
    log('info', 'pricing.decide', {
      tag: 'pricing.decide',
      listingId: req.listingId,
      event: req.event.type,
      bucket: `${bucket.category}/${bucket.gradeKey}`,
      anchor: Math.round(anchor),
      currentPrice: Math.round(currentPrice),
      chosenArm: choice.chosenArm,
      predictedRewards: Object.fromEntries(
        Object.entries(rewards).map(([k, v]) => [k, Math.round(v)]),
      ),
      rawPrice: Math.round(rawPrice),
      finalPrice: guard.finalPrice,
      floor,
      ceiling: decision.ceiling,
      shouldReroute: guard.shouldReroute,
      guardrails: guard.guardrailsApplied.filter((g) => g.triggered).map((g) => g.rule),
      modelVersion: this.modelVersion,
      reason: decision.reason,
    });
    return decision;
  }

  /** Log a sale/reroute outcome → reward → bandit update. The (state, arm, reward)
   *  rows accumulate here and seed the next offline retrain. */
  logOutcome(outcome: PricingOutcome): { reward: number; bucketUpdated: boolean } {
    const reward = computeReward(outcome);
    const prior = this.lastByListing.get(outcome.listingId);
    let bucketUpdated = false;
    if (prior) {
      this.bandit.update(prior.bucket, outcome.arm);
      bucketUpdated = true;
    }
    this.outcomeLog.push({ ...outcome, reward });

    // Real (state, arm, reward) row → Mongo (spec 024, phase 7) — the durable
    // bridge into ml/pricing's offline retraining (see
    // scripts/exportPricingTransactions.ts). Only possible when we actually
    // have the state this outcome's decision used.
    if (prior) {
      logPricingTransaction({
        listing_id: outcome.listingId,
        state: prior.state,
        arm: outcome.arm,
        reward,
        sold: outcome.sold,
        rerouted: outcome.rerouted,
        reroute_destination: outcome.rerouteDestination,
        final_price: outcome.finalPrice,
        days_on_market: outcome.daysOnMarket,
      });
    }

    // Unified "thinking" trace — same schema the Python agent emits, so a CloudWatch query
    // spans both. One outcome line per terminal event...
    log('info', 'pricing.outcome', {
      tag: 'pricing.outcome',
      listingId: outcome.listingId,
      bucket: prior ? `${prior.bucket.category}/${prior.bucket.gradeKey}` : null,
      arm: outcome.arm,
      sold: outcome.sold,
      rerouted: outcome.rerouted,
      rerouteDestination: outcome.rerouteDestination ?? null,
      finalPrice: Math.round(outcome.finalPrice),
      daysOnMarket: outcome.daysOnMarket,
      reward: Math.round(reward),
    });
    // ...and a signal when enough fresh rows have accrued to justify a retrain. The API
    // can't retrain XGBoost itself (that's the Python learning loop, ml/pricing/retrain.py);
    // it emits the trigger so an offline job / operator picks it up — honest split.
    if (this.outcomeLog.length % RETRAIN_EVERY === 0) {
      log('info', 'pricing.retrain_due', {
        tag: 'pricing.retrain_due',
        loggedOutcomes: this.outcomeLog.length,
        retrainEvery: RETRAIN_EVERY,
        note: 'run ml/pricing retrain_from_logger → offline_policy_evaluation → promote',
      });
    }
    return { reward, bucketUpdated };
  }

  getBanditState(listingId: string): BanditState | null {
    const prior = this.lastByListing.get(listingId);
    return prior ? this.bandit.snapshot(prior.bucket) : null;
  }

  get loggedOutcomeCount(): number {
    return this.outcomeLog.length;
  }
}
