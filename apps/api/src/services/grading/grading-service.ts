// Orchestrates grading: assess each photo (one model call per image, in
// parallel) then aggregate into a single GradingResult. The per-image grade is
// model-driven; the aggregation is deterministic and explainable (glass-box):
// overall condition is bounded by the most-worn angle, and issues are the union
// across angles — so more angles catch more, which is the whole point of grading
// at the source.

import { randomUUID } from 'node:crypto';
import type { ConditionGrade, GradeRequest, GradingResult } from '@reloop/shared';
import type { ReferenceComparator, VlmAssessment, VlmProvider } from './types.js';

// Most-worn first → best last; index doubles as severity ordinal.
const SEVERITY: readonly ConditionGrade[] = ['poor', 'fair', 'good', 'like-new', 'new'];

function aggregate(assessments: VlmAssessment[]): VlmAssessment {
  // Overall grade = the most-worn angle (lowest severity ordinal).
  const worst = assessments.reduce((acc, a) =>
    SEVERITY.indexOf(a.grade) < SEVERITY.indexOf(acc.grade) ? a : acc,
  );

  // Union of issues across all angles, de-duplicated (case-insensitive).
  const seen = new Set<string>();
  const detectedIssues: string[] = [];
  for (const a of assessments) {
    for (const issue of a.detectedIssues) {
      const key = issue.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        detectedIssues.push(issue);
      }
    }
  }

  const confidence =
    assessments.reduce((sum, a) => sum + a.confidence, 0) / assessments.length;

  return {
    grade: worst.grade,
    confidence,
    detectedIssues: detectedIssues.slice(0, 12),
    summary: worst.summary,
  };
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
        // eslint-disable-next-line no-console
        console.error('[reloop/api] one image failed to grade:', err instanceof Error ? err.message : err);
      }
    }

    if (assessments.length === 0) {
      throw new Error(lastError ? String(lastError) : 'all image assessments failed');
    }

    const merged = aggregate(assessments);
    const productId = `prod_${randomUUID()}`;

    // Diff against the original listing when a reference was provided (glass-box,
    // mockable behind ReferenceComparator).
    const referenceComparison = req.reference
      ? this.referenceComparator.compare({
          draft: req.draft,
          grade: merged.grade,
          detectedIssues: merged.detectedIssues,
          reference: req.reference,
        })
      : undefined;

    return {
      id: `grade_${randomUUID()}`,
      productId,
      grade: merged.grade,
      confidence: merged.confidence,
      detectedIssues: merged.detectedIssues,
      summary: merged.summary,
      ...(referenceComparison ? { referenceComparison } : {}),
      // Echo thumbnails so the client can render what was graded.
      photoUrls: req.imagesBase64.map((b64) => `data:image/jpeg;base64,${b64}`),
      gradedAt: new Date().toISOString(),
    };
  }
}
