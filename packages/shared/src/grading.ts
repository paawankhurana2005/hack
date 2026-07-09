// AI Grading — "the eyes". Multimodal condition assessment from photos.
// Stub contract for the scaffold; fields may be refined in a later spec.

import type { ConditionGrade, ID } from './common.js';

/** How bad a single observed flaw is. Ordinal: minor < moderate < severe. */
export type IssueSeverity = 'minor' | 'moderate' | 'severe';

/** Per-photo capture quality the model reports, so we can ask for a better shot. */
export type PhotoQuality = 'clear' | 'blurry' | 'dark' | 'occluded';

/**
 * A structured, localized defect (Phase 1). `type` comes from the category rubric
 * (see grading-rubric.ts), `region` is a coarse zone on the item ("toe box", "screen"),
 * and `severity` feeds the deterministic aggregation. The flat `detectedIssues`
 * string[] on GradingResult is still populated (back-compat) by flattening these.
 */
export interface DetectedIssue {
  type: string;
  severity: IssueSeverity;
  region: string;
}

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
  /** Human-readable issues spotted, e.g. ["scuff on corner"]. Always populated
   *  (flattened from `structuredIssues` when present) for back-compat. */
  detectedIssues: string[];
  /** Structured, localized defects with severity (Phase 1). Omitted by older callers. */
  structuredIssues?: DetectedIssue[];
  /** One-line plain-English condition summary from the model. */
  summary: string;
  /** The trained grader's raw continuous condition score, 0 (destroyed)..1 (new).
   *  Only the trained model emits it; the hosted-VLM fallback has no such output. */
  conditionScore?: number;
  photoUrls: string[];
  /** Diff vs the original listing. Omitted when no reference was provided. */
  referenceComparison?: ReferenceComparison;
  /** Mean capture quality across photos, 0..1 (Phase 1). */
  qualityScore?: number;
  /** Calibrated confidence fell below the abstain band → route to human review. */
  needsReview?: boolean;
  /** Closed-loop capture asks when photos are too poor/thin to grade well. */
  captureGuidance?: string[];
  /** ISO 8601 timestamp. */
  gradedAt: string;
}
