// Product Health Card — "the trust layer".
// Verifiable condition, history, and authenticity that travels with the item.

import type { ConditionGrade, ID, Money } from './common.js';
import type { GradingResult } from './grading.js';
import type { PricingResult } from './pricing.js';
import type { ItemId } from './provenance.js';
import type { SellItemDraft } from './sell.js';

export interface HealthCardEvent {
  label: string; // e.g. "Graded", "Verified authentic"
  /** ISO 8601 timestamp. */
  at: string;
}

export interface ProductHealthCard {
  id: ID;
  productId: ID;
  /** The physical item this card describes — the key into its provenance chain. */
  itemId: ItemId;
  title: string;
  grade: ConditionGrade;
  /** Grading confidence, 0..1. */
  confidence: number;
  /** One-line buyer-facing condition/trust summary. */
  summary: string;
  detectedIssues: string[];
  authenticityVerified: boolean;
  /**
   * Spec 023: set for return-sourced items (undefined for fresh Sell-flow
   * items, which always ship their original packaging). false surfaces a
   * "packaging not included" badge on the marketplace card.
   */
  packagingSealed?: boolean;
  /** Recommended resale price carried onto the card. */
  listingPrice?: Money;
  history: HealthCardEvent[];
  /** Shareable link that follows the item to its next owner. */
  healthCardUrl: string;
  /** ISO 8601 timestamp the card was issued. */
  issuedAt: string;
}

/** Request body for POST /api/sell/health-card. */
export interface HealthCardRequest {
  draft: SellItemDraft;
  grading: GradingResult;
  pricing: PricingResult;
}
