// AI Grading — "the eyes". Multimodal condition assessment from photos.
// Stub contract for the scaffold; fields may be refined in a later spec.

import type { ConditionGrade, ID } from './common.js';

/** One spec compared between the original listing and what grading observed. */
export interface SpecMatch {
  label: string; // e.g. "Model"
  expected: string; // from the original listing's specs
  observed: string; // inferred from photos, or "—" if not determinable
  match: boolean;
}

/**
 * Result of diffing the user's photos against the item's ORIGINAL listing photos
 * + specs — the "it actually checked the real product" signal. Produced by the
 * grading service behind a ReferenceComparator (real visual-diff or mock).
 */
export interface ReferenceComparison {
  /** Same product/model as the original listing? */
  authenticityMatch: boolean;
  /** Confidence in the authenticity/product-match signal, 0..1. */
  authenticityConfidence: number;
  /** Wear / scratches / missing parts observed vs the factory/original photos. */
  changedFromOriginal: string[];
  /** Plain-English: how the deviation from original shaped the grade. */
  gradeImpact: string;
  specMatches: SpecMatch[];
  /** Honest provenance label for the UI. */
  source: 'mock' | 'vlm-diff';
}

export interface GradingResult {
  id: ID;
  productId: ID;
  grade: ConditionGrade;
  /** Model confidence in the grade, 0..1. */
  confidence: number;
  /** Human-readable issues spotted, e.g. ["scuff on corner"]. */
  detectedIssues: string[];
  /** One-line plain-English condition summary from the model. */
  summary: string;
  photoUrls: string[];
  /** Diff vs the original listing. Omitted when no reference was provided. */
  referenceComparison?: ReferenceComparison;
  /** ISO 8601 timestamp. */
  gradedAt: string;
}
