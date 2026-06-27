// Human-in-the-loop (Phase 6) — the literal answer to "what if the AI is wrong?".
// A pure decision that routes uncertain or risky items to a human review queue
// instead of acting on a shaky model output. Low-confidence grades (the P1 abstain
// band), high-value-but-unverified items, authenticity mismatches, and fraud signals
// all get a clean, resumable review path. Maps to AWS A2I in production.

import { ABSTAIN_THRESHOLD } from './grading-rubric.js';

export type ReviewReason =
  | 'low_confidence'
  | 'high_value_unverified'
  | 'authenticity_mismatch'
  | 'fraud_signal';

/** Value at/above which an unverified item must be human-checked (₹20,000). */
export const REVIEW_HIGH_VALUE_CENTS = 2_000_000;

export interface ReviewSignals {
  /** Calibrated grade confidence (0..1). */
  calibratedConfidence?: number;
  /** Item value in paise (clearing/listing price). */
  valueCents?: number;
  /** Reference-diff authenticity result. */
  authenticityMatch?: boolean;
  /** Could the item be functionally verified from photos? */
  functionallyVerifiable?: boolean;
  /** Claimed reason contradicts the observed grade. */
  reasonGradeMismatch?: boolean;
}

export interface ReviewDecision {
  needsReview: boolean;
  reasons: ReviewReason[];
}

/** Decide whether an item needs human review, and why. Deterministic + glass-box. */
export function reviewDecision(s: ReviewSignals): ReviewDecision {
  const reasons: ReviewReason[] = [];
  if (s.calibratedConfidence !== undefined && s.calibratedConfidence < ABSTAIN_THRESHOLD) {
    reasons.push('low_confidence');
  }
  if (s.authenticityMatch === false) reasons.push('authenticity_mismatch');
  if (s.reasonGradeMismatch) reasons.push('fraud_signal');
  if (
    s.valueCents !== undefined &&
    s.valueCents >= REVIEW_HIGH_VALUE_CENTS &&
    (s.functionallyVerifiable === false || s.authenticityMatch === false)
  ) {
    reasons.push('high_value_unverified');
  }
  return { needsReview: reasons.length > 0, reasons };
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** One queued item awaiting a human decision. Append-only; resumes the flow. */
export interface ReviewItem {
  id: string;
  itemId?: string;
  title: string;
  reasons: ReviewReason[];
  /** Snapshot of what the model proposed, so the reviewer can confirm or override. */
  proposedGrade?: string;
  proposedPriceCents?: number;
  createdAt: string;
  status: ReviewStatus;
  note?: string;
}

const REASON_LABELS: Record<ReviewReason, string> = {
  low_confidence: 'Low grading confidence',
  high_value_unverified: 'High value, not verified from photos',
  authenticity_mismatch: 'Authenticity mismatch vs original listing',
  fraud_signal: 'Return reason contradicts the grade',
};

export function reviewReasonLabel(r: ReviewReason): string {
  return REASON_LABELS[r];
}
