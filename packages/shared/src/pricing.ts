// Sell-flow pricing ("routing" step): estimate retail, recommend a resale price.
// Logic decides the discount (glass-box); the LLM estimates market price + narrates.

import type { ConditionGrade, ID, Money } from './common.js';
import type { DetectedIssue } from './grading.js';
import type { SellItemDraft } from './sell.js';

export type DemandLevel = 'low' | 'medium' | 'high';

/** One glass-box input shown in the pricing explanation. */
export interface PricingFactor {
  label: string;
  value: string;
}

/** Where the resale-ratio came from. */
export type PriceModelSource = 'gbdt' | 'fallback-policy';

/** One point on the price ↔ time-to-sell tradeoff (Phase 2). */
export interface SellThroughPoint {
  label: 'aggressive' | 'recommended' | 'patient';
  priceCents: number;
  expectedDays: number;
  /** Probability of selling within 30 days at this price, 0..1. */
  sellThroughProb: number;
}

/** The base-reference anchor: the item's original Amazon listing (the moat). */
export interface PriceReference {
  /** Original retail price recorded at first sale (paise). */
  originalRetailCents: number;
  /** First-purchase date (ISO) → model age. */
  purchaseDate?: string;
  /** Item no longer sold new (firms scarcity, widens interval). */
  discontinued?: boolean;
}

export interface PricingResult {
  id: ID;
  productId: ID;
  grade: ConditionGrade;
  /** AI-estimated typical online retail price (clearly labelled as an estimate). */
  estimatedRetail: Money;
  /** Recommended resale price. */
  suggestedPrice: Money;
  /** Fraction off retail, 0..1. */
  discountPct: number;
  demand: DemandLevel;
  /** LLM-narrated explanation of the recommendation. */
  rationale: string;
  factors: PricingFactor[];
  /** Lower bound of the prediction interval (Phase 2). */
  priceLow?: Money;
  /** Upper bound of the prediction interval (Phase 2). */
  priceHigh?: Money;
  /** Price ↔ time-to-sell tradeoff (Phase 2). */
  sellThroughCurve?: SellThroughPoint[];
  /** Predicted clearing price sits below the salvage floor → signal for routing (P3). */
  belowFloor?: boolean;
  /** Whether the resale ratio came from the model or the deterministic fallback. */
  modelSource?: PriceModelSource;
  /** ISO 8601 timestamp. */
  pricedAt: string;
}

/** Request body for POST /api/sell/price. */
export interface PriceRequest {
  draft: SellItemDraft;
  grade: ConditionGrade;
  detectedIssues: string[];
  /** Idempotency key (see @reloop/shared stableKey) — retries reuse the same key. */
  requestKey?: string;
  // --- Phase 2: feature inputs for the resale-price predictor (all optional) ---
  /** Base-reference anchor (original Amazon listing). Absent → long-tail fallback. */
  reference?: PriceReference;
  /** Structured defects (severity) — richer than the flat detectedIssues. */
  structuredIssues?: DetectedIssue[];
  /** Completeness 0..1 (box / accessories / manual present). */
  completeness?: number;
  /** Authenticity confidence from the reference diff, 0..1. */
  authenticityConfidence?: number;
  /** Verified nearby buyers (local demand signal). */
  nearbyBuyers?: number;
}
