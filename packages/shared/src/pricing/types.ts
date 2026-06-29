// Data contracts for the event-driven dynamic-pricing engine (spec 014).
//
// This is the RE-pricing loop for an item that's already listed for resale — distinct
// from the one-shot sell-flow estimator in ../pricing.ts (which sets the FIRST price).
// Here a market event (a comp sells, views slow, a deadline nears) wakes the engine; a
// supervised reward model scores each price arm; a Thompson-sampling bandit selects one;
// deterministic guardrails clamp it; an LLM narrates. The model PERCEIVES expected
// reward, the bandit + rules DECIDE the price, the LLM only NARRATES.
//
// MONEY UNITS: this engine works in WHOLE RUPEES (INR), not paise — its guardrails
// (₹50 rounding, ₹100/8% step caps) and demo narration ("₹1,050") are rupee-native.
// Convert at the API boundary if a caller speaks paise.

import type { PriceArm } from './arms.js';

export type { PriceArm } from './arms.js';
export { PRICE_ARMS, NEUTRAL_ARM } from './arms.js';

// ── State the agent sees at decision time ───────────────────────────────────
// One flat, named, tabular vector — exactly the regime where gradient-boosted
// trees win. Every field is a signal the reward model is allowed to read.
export type PricingStateVector = {
  // item identity
  category: string;
  categoryL1: string;
  categoryL2: string;
  brand: string;
  /** 5=new, 4=like-new, 3=good, 2=fair, 1=poor. (Note: inverse of features.ts
   *  gradeToOrdinal, which is 0=poor..4=new — this engine is internally 5=new.) */
  gradeOrdinal: number;
  gradeKey: 'new' | 'like-new' | 'good' | 'fair' | 'poor';
  originalPriceLog: number; // log1p(original retail ₹)
  itemAgeDays: number; // age of the product model itself
  hasAccessories: boolean; // box, charger included
  authenticityScore: number; // 0-1 from DINOv2 comparator
  damageScore: number; // 0-1 from DINOv2 grader
  defectCount: number; // number of detected defects

  // listing lifecycle
  daysOnMarket: number;
  numReprices: number;
  currentDiscountPct: number; // how far below anchor already
  deadlinePressure: number; // (deadline - today) / window, 0=urgent 1=relaxed

  // demand signals (from platform events)
  viewVelocity24h: number; // views in last 24h
  viewVelocityTrend: number; // ratio vs prior 24h (>1 = rising)
  saveRate: number; // saves / views
  ctr: number; // clicks / impressions
  messageCount: number; // direct buyer enquiries
  cartAbandons: number; // add-to-cart without purchase

  // competition signals
  compCountNearby: number; // similar listings in geo radius
  compMedianPrice: number; // the anchor price
  compMinPrice: number; // cheapest competitor
  compSoldLast7d: number; // market velocity
  compAvgDaysToSell: number; // how long comps typically sit
  amazonNewPrice: number; // hard ceiling

  // geo / local
  nearbyBuyerCount: number;
  localSupplyCount: number;
  geoDemandIndex: number; // city-level demand for category

  // seller constraints
  sellerFloor: number; // seller's minimum acceptable price
  /** max(donate, recycle, refurb) value — true floor = max(sellerFloor, this). */
  routeElsewhereValue: number;

  // temporal (sin/cos encoding for cyclical features)
  dayOfWeekSin: number;
  dayOfWeekCos: number;
  hourOfDaySin: number;
  hourOfDayCos: number;
  seasonalityIndex: number; // category-specific seasonal demand (0-1)
};

/** One point on the price ↔ time-to-sell tradeoff curve (engine variant; named to
 *  avoid clashing with the sell-flow SellThroughPoint in ../pricing.ts). */
export type SellThroughCurvePoint = {
  price: number;
  expectedDaysToSell: number;
  probability: number; // P(sell within 14 days at this price)
};

export type GuardrailResult = {
  rule: string;
  triggered: boolean;
  adjustment?: number;
};

export type PricingReasonCode =
  | 'comp_sold_nearby'
  | 'comp_listed_cheaper'
  | 'amazon_new_price_dropped'
  | 'view_velocity_drop'
  | 'dwell_threshold'
  | 'save_no_purchase'
  | 'deadline_pressure'
  | 'initial_listing'
  | 'heartbeat_staleness';

/** Demand events that can trigger a reprice. */
export type DemandEventType =
  | 'comp_sold'
  | 'comp_listed'
  | 'asin_new_price_changed'
  | 'view_velocity_drop'
  | 'dwell_threshold'
  | 'save_no_purchase'
  | 'heartbeat'
  | 'initial_listing';

export type DemandEvent = {
  type: DemandEventType;
  listingId: string;
  timestamp: string;
  payload: Record<string, unknown>; // event-specific data
};

/** A single pricing decision — fully reproducible from its own fields. */
export type PricingDecision = {
  listingId: string;
  anchorPrice: number; // comp median
  chosenArm: PriceArm;
  rawPrice: number; // anchor × arm (before guardrails)
  finalPrice: number; // after guardrails
  floor: number; // max(sellerFloor, routeElsewhereValue)
  ceiling: number; // amazonNewPrice
  predictedRewards: Record<PriceArm, number>; // model's prediction per arm
  expectedMargin: number;
  sellThroughCurve: SellThroughCurvePoint[]; // price → expected days to sell
  reason: string; // LLM narration (or fallback template)
  reasonCode: PricingReasonCode;
  triggeredBy: DemandEventType;
  modelVersion: string; // for audit
  timestamp: string;
  guardrailsApplied: GuardrailResult[];
};

/** The outcome logged after a sale or reroute — the training signal for Stage 2. */
export type PricingOutcome = {
  listingId: string;
  decisionId: string;
  arm: PriceArm;
  finalPrice: number;
  sold: boolean;
  daysOnMarket: number;
  reward: number; // computed by the reward function
  soldLocally: boolean;
  rerouted: boolean;
  rerouteDestination?: string;
};

/** Bandit state — persisted per context bucket. */
export type BanditState = {
  bucket: ContextBucket;
  armObservations: Record<PriceArm, number>;
  armUncertainty: Record<PriceArm, number>;
  totalDecisions: number;
  lastUpdated: string;
};

export type ContextBucket = {
  category: string;
  gradeKey: string;
};
