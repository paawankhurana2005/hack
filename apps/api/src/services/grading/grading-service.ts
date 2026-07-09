// Orchestrates grading: assess each photo (one model call per image) then aggregate
// into a single GradingResult. The per-image perception is model-driven; the
// aggregation, calibration, and abstain decision are deterministic and explainable
// (glass-box): overall condition is bounded by the most-worn angle, structured
// issues are the de-duplicated union (worst severity wins), confidence is calibrated
// before the abstain check, and poor/thin photos produce closed-loop capture guidance
// instead of a confident grade on bad input. More angles catch more — by design.

import { randomUUID } from 'node:crypto';
import type { ConditionGrade, DetectedIssue, GradeRequest, GradingResult, PhotoQuality } from '@reloop/shared';
import { log } from '../../lib/logger.js';
import {
  ABSTAIN_THRESHOLD,
  calibrateConfidence,
  needsReview as isAbstain,
  photoQualityScore,
  severityToOrdinal,
} from '@reloop/shared';
import type { ReferenceComparator, VlmAssessment, VlmProvider } from './types.js';
import { issueToString } from './nvidia-provider.js';

// Most-worn first → best last; index doubles as severity ordinal.
const SEVERITY: readonly ConditionGrade[] = ['poor', 'fair', 'good', 'like-new', 'new'];

// Worst capture quality wins for the merged angle (lowest score = most problematic).
function worstQuality(qualities: PhotoQuality[]): PhotoQuality {
  return qualities.reduce((acc, q) => (photoQualityScore(q) < photoQualityScore(acc) ? q : acc));
}

/** Union structured issues across angles; same type+region keeps the worst severity. */
function mergeStructuredIssues(assessments: VlmAssessment[]): DetectedIssue[] {
  const byKey = new Map<string, DetectedIssue>();
  for (const a of assessments) {
    for (const issue of a.structuredIssues) {
      const key = `${issue.type.toLowerCase()}|${issue.region.toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing || severityToOrdinal(issue.severity) > severityToOrdinal(existing.severity)) {
        byKey.set(key, issue);
      }
    }
  }
  return [...byKey.values()].slice(0, 12);
}

// Exported so the eval harness measures the EXACT worst-angle aggregation the
// service ships (no logic duplication / drift).
export function aggregate(assessments: VlmAssessment[]): VlmAssessment {
  // Overall grade = the most-worn angle (lowest severity ordinal).
  const worst = assessments.reduce((acc, a) =>
    SEVERITY.indexOf(a.grade) < SEVERITY.indexOf(acc.grade) ? a : acc,
  );

  const structuredIssues = mergeStructuredIssues(assessments);
  const confidence =
    assessments.reduce((sum, a) => sum + a.confidence, 0) / assessments.length;

  return {
    grade: worst.grade,
    confidence,
    // The score comes from the SAME angle the grade does, so the number the user
    // sees always explains the bucket they were given.
    ...(typeof worst.score === 'number' ? { score: worst.score } : {}),
    structuredIssues,
    detectedIssues: structuredIssues.map(issueToString),
    photoQuality: worstQuality(assessments.map((a) => a.photoQuality)),
    summary: worst.summary,
  };
}

/** Deterministic, closed-loop asks when the photos can't support a reliable grade. */
function captureGuidanceFor(
  assessments: VlmAssessment[],
  qualityScore: number,
  abstaining: boolean,
): string[] {
  const guidance: string[] = [];
  if (qualityScore < 0.6) {
    guidance.push('Add a clearer, well-lit photo — the current shots are blurry, dark, or obstructed.');
  }
  if (assessments.length < 2) {
    guidance.push('Add more angles (front, back, sides) so the grade reflects the whole item.');
  }
  if (abstaining && guidance.length === 0) {
    guidance.push('Confidence is low — a sharper close-up of any wear would firm up the grade.');
  }
  return guidance;
}

export class GradingService {
  constructor(
    private readonly provider: VlmProvider,
    private readonly referenceComparator: ReferenceComparator,
  ) {}

  async grade(req: GradeRequest): Promise<GradingResult> {
    // Sequential, NOT parallel: the hosted VLM rejects/queues concurrent requests
    // from one key, so firing all images at once hangs. One at a time is reliable.
    const assessments: VlmAssessment[] = [];
    let lastError: unknown;
    for (const imageBase64 of req.imagesBase64) {
      try {
        assessments.push(await this.provider.assessImage({ draft: req.draft, imageBase64 }));
      } catch (err) {
        lastError = err;
        log('warn', 'one image failed to grade', {
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (assessments.length === 0) {
      throw new Error(lastError ? String(lastError) : 'all image assessments failed');
    }

    const merged = aggregate(assessments);
    const productId = `prod_${randomUUID()}`;

    // Calibrate the raw confidence, then decide abstain (deterministic, glass-box).
    const calibratedConfidence = calibrateConfidence(merged.confidence);
    const needsReview = isAbstain(calibratedConfidence);
    const qualityScore =
      assessments.reduce((sum, a) => sum + photoQualityScore(a.photoQuality), 0) / assessments.length;
    const captureGuidance = captureGuidanceFor(assessments, qualityScore, needsReview);

    // Diff against the original listing when a reference was provided (real VLM
    // comparator with a deterministic mock fallback, behind ReferenceComparator).
    const referenceComparison = req.reference
      ? await this.referenceComparator.compare({
          draft: req.draft,
          grade: merged.grade,
          detectedIssues: merged.detectedIssues,
          reference: req.reference,
          primaryImageBase64: req.imagesBase64[0],
        })
      : undefined;

    return {
      id: `grade_${randomUUID()}`,
      productId,
      grade: merged.grade,
      confidence: calibratedConfidence,
      ...(typeof merged.score === 'number' ? { conditionScore: merged.score } : {}),
      detectedIssues: merged.detectedIssues,
      structuredIssues: merged.structuredIssues,
      summary: merged.summary,
      ...(referenceComparison ? { referenceComparison } : {}),
      photoUrls: req.imagesBase64.map((b64) => `data:image/jpeg;base64,${b64}`),
      qualityScore,
      needsReview,
      ...(captureGuidance.length ? { captureGuidance } : {}),
      gradedAt: new Date().toISOString(),
    };
  }
}

// Re-export so callers needing the abstain band don't reach into shared directly.
export { ABSTAIN_THRESHOLD };
