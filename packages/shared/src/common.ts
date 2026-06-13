// Shared primitives used across all ReLoop data contracts.
// Types only — no logic. Single source of truth lives in @reloop/shared.

export type ID = string;

/** Condition grade produced by AI grading ("the eyes"). */
export type ConditionGrade = 'new' | 'like-new' | 'good' | 'fair' | 'poor';

/** Money is always stored in minor units (paise) to avoid float rounding. */
export interface Money {
  amountCents: number;
  currency: 'INR';
}
