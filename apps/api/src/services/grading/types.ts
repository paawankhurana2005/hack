// Provider-agnostic grading contract. The service codes against this capability,
// so swapping the underlying model is a one-file change.
//
// NVIDIA's hosted VLM accepts one image per request, so the provider assesses a
// SINGLE photo; the GradingService grades each angle and aggregates the results.

import type {
  ConditionGrade,
  DetectedIssue,
  GradeReference,
  PhotoQuality,
  ReferenceComparison,
  SellItemDraft,
} from '@reloop/shared';

/** Per-image, model-derived assessment. */
export interface VlmAssessment {
  grade: ConditionGrade;
  confidence: number; // 0..1 (raw, pre-calibration)
  detectedIssues: string[];
  /** Structured, localized defects (Phase 1). Flattened into detectedIssues too. */
  structuredIssues: DetectedIssue[];
  /** Capture quality of this photo (Phase 1). */
  photoQuality: PhotoQuality;
  summary: string;
}

export interface VlmImageInput {
  draft: SellItemDraft;
  /** A single base64 JPEG without the data: prefix. */
  imageBase64: string;
}

export interface VlmProvider {
  /** Assess condition from ONE photo. Throws on transport/parse failure. */
  assessImage(input: VlmImageInput): Promise<VlmAssessment>;
}

/** Input to the reference comparison: the merged grade + the original-listing reference. */
export interface ReferenceInput {
  draft: SellItemDraft;
  grade: ConditionGrade;
  detectedIssues: string[];
  reference: GradeReference;
  /** The user's primary photo (base64, no data: prefix) — lets a real VLM look. */
  primaryImageBase64?: string;
}

/**
 * Diffs the user's item against its original listing. The VLM comparator grounds
 * an authenticity signal in the model + the original specs; the mock derives it
 * deterministically. Async so a real model call fits the same contract.
 */
export interface ReferenceComparator {
  compare(input: ReferenceInput): Promise<ReferenceComparison>;
}
