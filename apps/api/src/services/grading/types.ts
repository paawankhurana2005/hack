// Provider-agnostic grading contract. The service codes against this capability,
// so swapping the underlying model is a one-file change.
//
// NVIDIA's hosted VLM accepts one image per request, so the provider assesses a
// SINGLE photo; the GradingService grades each angle and aggregates the results.

import type { ConditionGrade, SellItemDraft } from '@reloop/shared';

/** Per-image, model-derived assessment. */
export interface VlmAssessment {
  grade: ConditionGrade;
  confidence: number; // 0..1
  detectedIssues: string[];
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
