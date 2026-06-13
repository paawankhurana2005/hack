// AI Grading — "the eyes". Multimodal condition assessment from photos.
// Stub contract for the scaffold; fields may be refined in a later spec.

import type { ConditionGrade, ID } from './common.js';

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
  /** ISO 8601 timestamp. */
  gradedAt: string;
}
