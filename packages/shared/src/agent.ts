// The Listing Agent — "the autonomy". A pure, deterministic decision engine that
// watches a listing and, each simulated day, picks the right lever to get it
// sold (or routed elsewhere if resale isn't viable). Logic decides here; an LLM
// only narrates the result. Lives in @reloop/shared so it is the single source of
// truth and runs identically on client and server.

import type { ConditionGrade } from './common.js';
import type { DemandLevel } from './pricing.js';
import type { ItemCategory } from './sell.js';

export type AgentAction =
  | 'hold'
  | 'reprice'
  | 'widen_radius'
  | 'improve_listing'
  | 'escalate_route'
  // Sales Agent only (spec 024) — un-escalates a donate/recycle return-sourced
  // listing whose local geo-demand has since improved past what it was at
  // escalation time. Meaningless against the old flat geo placeholder; only a
  // real payoff once geo-demand is wired to actual data (spec 024, phase A).
  | 'relist';

export type AgentPhase = 'perceived' | 'diagnosed' | 'decided' | 'acted';

/** Where the agent routes an item it can no longer sell. */
export type RouteRecommendation = 'donate' | 'recycle';

/** Fixed, per-listing simulated market signals. Mock inputs; the reasoning that
 *  runs over them is real deterministic code. */
export interface MarketContext {
  /** Nearby comparable price for this grade+category (paise). May sit BELOW the
   *  floor — i.e. the market wants less than we can sustainably sell for. */
  comparableCents: number;
  localDemand: DemandLevel;
  /** Opportunity/storage cost accruing per day (paise) — erodes viability. */
  holdingCostPerDayCents: number;
  /** Views/day at a fair price; scaled down when overpriced, by demand. */
  baseViewsPerDay: number;
}

/** Everything the engine sees on a single tick. */
export interface AgentSnapshot {
  day: number;
  priceCents: number;
  floorCents: number;
  retailCents: number;
  grade: ConditionGrade;
  category: ItemCategory;
  views: number;
  offers: number;
  radiusKm: number;
  holdingCostAccruedCents: number;
  /** Set once the agent has already suggested a listing improvement. */
  hasImproved: boolean;
  ctx: MarketContext;
}

/** One glass-box input that informed the decision. */
export interface AgentFactor {
  label: string;
  value: string;
}

export interface AgentDecision {
  action: AgentAction;
  /** Short deterministic "why" — the diagnosis. */
  diagnosis: string;
  factors: AgentFactor[];
  /** Set for `reprice`. Guaranteed >= floorCents. */
  newPriceCents?: number;
  /** Set for `widen_radius`. */
  newRadiusKm?: number;
  /** Set for `escalate_route`. */
  routeRecommendation?: RouteRecommendation;
  confidence: number; // 0..1
}

/** One entry in a listing's activity feed. */
export interface AgentEvent {
  day: number;
  phase: AgentPhase;
  text: string;
  at: string; // ISO
  action?: AgentAction;
  priceFromCents?: number;
  priceToCents?: number;
  floorCents?: number;
  routeRecommendation?: RouteRecommendation;
  /** Spec 022: the deterministic factors behind a 'diagnosed' event — the
   *  itemized "why" underneath the one-line diagnosis text. */
  factors?: AgentFactor[];
}

/** Request body for POST /api/agent/narrate (LLM phrases the acted line). */
export interface AgentNarrateRequest {
  action: AgentAction;
  diagnosis: string;
  priceFromCents?: number;
  priceToCents?: number;
  floorCents?: number;
  comparableCents: number;
  demand: DemandLevel;
  radiusKm?: number;
  routeRecommendation?: RouteRecommendation;
  day: number;
  title: string;
}

export interface AgentNarrateResponse {
  text: string;
}

/** Result of one portfolio-level Sales Agent run (spec 024) — a batch driver
 *  over the same per-listing engine above, not a new decision brain. Reuses
 *  AgentEvent verbatim; adds nothing to the decision layer itself. */
export interface SalesAgentDigest {
  ranAt: string; // ISO
  listingsReviewed: number;
  actionsByType: Partial<Record<AgentAction, number>>;
  events: AgentEvent[];
  narrative: string;
}

// --- Tunables (the glass-box rules) -----------------------------------------

/** Reprice when listed more than this fraction above the local comparable. */
const REPRICE_GAP_TRIGGER = 0.05;
/** Each reprice closes this fraction of the gap to the comparable... */
const REPRICE_STEP_FRACTION = 0.5;
/** ...but never drops more than this fraction in one tick (gradual + visible). */
const REPRICE_MAX_STEP_PCT = 0.15;
/** Price rounds to the nearest this many paise for clean numbers. */
const PRICE_ROUNDING_CENTS = 5_000; // ₹50
/** Treat price as "at the floor" within this margin. */
const FLOOR_MARGIN = 1.05;

/** Match-radius ladder (km): neighbourhood → city. */
export const RADIUS_LADDER = [4, 25] as const;
export function maxRadiusKm(): number {
  return RADIUS_LADDER[RADIUS_LADDER.length - 1]!;
}
function nextRadius(current: number): number | null {
  return RADIUS_LADDER.find((r) => r > current) ?? null;
}

// --- Helpers -----------------------------------------------------------------

function rupees(cents: number): string {
  return `₹${Math.round(cents / 100).toLocaleString('en-IN')}`;
}

const DEMAND_VIEW_FACTOR: Record<DemandLevel, number> = {
  low: 0.5,
  medium: 1,
  high: 1.4,
};

/** Deterministic views accrued in one day at a given price. Overpricing relative
 *  to the comparable suppresses interest; demand scales it. No randomness — the
 *  arc is identical every run. */
export function simulateDailyViews(priceCents: number, ctx: MarketContext): number {
  const gap = (priceCents - ctx.comparableCents) / ctx.comparableCents;
  const priceFactor = Math.min(1.3, Math.max(0.15, 1 - gap));
  const raw = ctx.baseViewsPerDay * priceFactor * DEMAND_VIEW_FACTOR[ctx.localDemand];
  return Math.max(0, Math.round(raw));
}

function roundPrice(cents: number): number {
  return Math.round(cents / PRICE_ROUNDING_CENTS) * PRICE_ROUNDING_CENTS;
}

// --- The engine --------------------------------------------------------------

/** Decide the single best action for this listing this tick. Pure + deterministic. */
export function decideAgentAction(s: AgentSnapshot): AgentDecision {
  const comp = s.ctx.comparableCents;
  const gap = (s.priceCents - comp) / comp; // + means above the market
  const viewsPerDay = s.day > 0 ? s.views / s.day : 0;
  const viewsWeak = viewsPerDay < s.ctx.baseViewsPerDay * 0.5;
  const atFloor = s.priceCents <= s.floorCents * FLOOR_MARGIN;
  const radiusMaxed = s.radiusKm >= maxRadiusKm();

  const baseFactors: AgentFactor[] = [
    { label: 'Days listed', value: `${s.day}` },
    { label: 'Views', value: `${s.views}` },
    { label: 'Offers', value: `${s.offers}` },
    { label: 'Comparable', value: rupees(comp) },
    { label: 'Local demand', value: s.ctx.localDemand },
    { label: 'Floor', value: rupees(s.floorCents) },
  ];

  // 0. Fresh listing — give the market a day before touching anything.
  if (s.day === 0) {
    return {
      action: 'hold',
      diagnosis: 'Just listed — watching the market before acting.',
      factors: baseFactors,
      confidence: 0.9,
    };
  }

  // 1. Overpriced vs the market, no offers, still room above the floor → reprice.
  if (gap > REPRICE_GAP_TRIGGER && s.offers === 0 && s.priceCents > s.floorCents) {
    const desired = s.priceCents - (s.priceCents - comp) * REPRICE_STEP_FRACTION;
    const minByStep = s.priceCents * (1 - REPRICE_MAX_STEP_PCT);
    // Bounded step, then CLAMP to the floor — the rail the agent cannot cross.
    let next = Math.max(desired, minByStep);
    next = Math.max(next, s.floorCents);
    next = Math.max(roundPrice(next), s.floorCents);
    return {
      action: 'reprice',
      diagnosis: `Priced ${Math.round(gap * 100)}% above the ${rupees(comp)} local comparable${
        viewsWeak ? ' with weak interest' : ''
      }.`,
      factors: baseFactors,
      newPriceCents: next,
      confidence: 0.88,
    };
  }

  // 2. Price is competitive (or pinned at the floor) but reach may be the issue →
  //    widen the match radius before giving up. Reach problem, not price problem.
  if (s.ctx.localDemand !== 'high' && s.offers === 0 && (atFloor || gap <= 0.05)) {
    const nr = nextRadius(s.radiusKm);
    if (nr !== null) {
      return {
        action: 'widen_radius',
        diagnosis: `Price is competitive but local demand is ${s.ctx.localDemand} — expanding reach to ${nr}km.`,
        factors: baseFactors,
        newRadiusKm: nr,
        confidence: 0.8,
      };
    }
  }

  // 3. Resale exhausted: at the floor, low demand, reach maxed, still no takers →
  //    stop selling and route it elsewhere (the recycle / donate escalation).
  if (atFloor && s.ctx.localDemand === 'low' && radiusMaxed && s.offers === 0 && s.day >= 3) {
    const rec: RouteRecommendation =
      s.grade === 'poor' || comp < s.floorCents ? 'recycle' : 'donate';
    return {
      action: 'escalate_route',
      diagnosis:
        `At the ${rupees(s.floorCents)} floor with the market at ${rupees(comp)} and ${s.ctx.localDemand} ` +
        `demand even city-wide — resale isn't viable after ${rupees(s.holdingCostAccruedCents)} holding cost.`,
      factors: [...baseFactors, { label: 'Holding cost', value: rupees(s.holdingCostAccruedCents) }],
      routeRecommendation: rec,
      confidence: 0.82,
    };
  }

  // 4. People look but don't act → the listing itself may be the gap (one-shot).
  if (s.views >= s.ctx.baseViewsPerDay * 3 && s.offers === 0 && !s.hasImproved) {
    return {
      action: 'improve_listing',
      diagnosis: `${s.views} views but no offers — the listing may need stronger photos or detail.`,
      factors: baseFactors,
      confidence: 0.7,
    };
  }

  // 5. Nothing to do this tick.
  return {
    action: 'hold',
    diagnosis: atFloor
      ? 'Holding at the floor — reach widened, waiting for a match.'
      : 'Competitively priced — holding and waiting for a match.',
    factors: baseFactors,
    confidence: 0.6,
  };
}
