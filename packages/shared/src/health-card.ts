// Product Health Card — "the trust layer".
// Verifiable condition, history, and authenticity that travels with the item.
// Stub contract for the scaffold.

import type { ConditionGrade, ID } from './common.js';

export interface HealthCardEvent {
  label: string; // e.g. "Graded", "Verified authentic"
  /** ISO 8601 timestamp. */
  at: string;
}

export interface ProductHealthCard {
  id: ID;
  productId: ID;
  title: string;
  grade: ConditionGrade;
  authenticityVerified: boolean;
  history: HealthCardEvent[];
  /** Shareable link that follows the item to its next owner. */
  healthCardUrl: string;
}
