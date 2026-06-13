// Sell-flow pricing ("routing" step): estimate retail, recommend a resale price.
// Logic decides the discount (glass-box); the LLM estimates market price + narrates.

import type { ConditionGrade, ID, Money } from './common.js';
import type { SellItemDraft } from './sell.js';

export type DemandLevel = 'low' | 'medium' | 'high';

/** One glass-box input shown in the pricing explanation. */
export interface PricingFactor {
  label: string;
  value: string;
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
  /** ISO 8601 timestamp. */
  pricedAt: string;
}

/** Request body for POST /api/sell/price. */
export interface PriceRequest {
  draft: SellItemDraft;
  grade: ConditionGrade;
  detectedIssues: string[];
}
