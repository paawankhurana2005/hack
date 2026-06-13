// Deterministic, clearly-labeled mock of the original-listing comparison. It does
// NOT look at pixels — it derives the diff from the model's grade + detected issues
// + the original specs, so the review screen has a believable, honest comparison
// until a real visual-diff provider is wired in (same ReferenceComparator contract).

import type { ReferenceComparison, SpecMatch } from '@reloop/shared';
import type { ReferenceComparator, ReferenceInput } from './types.js';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export class MockReferenceComparator implements ReferenceComparator {
  compare({ grade, detectedIssues, reference }: ReferenceInput): ReferenceComparison {
    // Mock assumes a genuine product; confidence dips slightly as issues accumulate.
    const authenticityConfidence = clamp(0.99 - detectedIssues.length * 0.015, 0.82, 0.99);

    // Differences vs factory = the detected issues, plus a general wear note when
    // the item is no longer "new". De-duplicated, capped.
    const changed: string[] = [];
    const seen = new Set<string>();
    const push = (s: string) => {
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        changed.push(s);
      }
    };
    if (grade !== 'new') push('Shows signs of use not present in the original listing');
    for (const issue of detectedIssues) push(issue);
    const changedFromOriginal = changed.slice(0, 8);

    const gradeImpact =
      grade === 'new' && detectedIssues.length === 0
        ? 'Matches the original listing — no deviations found.'
        : `${changedFromOriginal.length} deviation${
            changedFromOriginal.length === 1 ? '' : 's'
          } from the original listing account for the “${grade}” grade.`;

    // Mock treats specs as consistent with the original (observed = expected).
    const specMatches: SpecMatch[] = Object.entries(reference.originalSpecs).map(
      ([label, expected]) => ({ label, expected, observed: expected, match: true }),
    );

    return {
      authenticityMatch: true,
      authenticityConfidence,
      changedFromOriginal,
      gradeImpact,
      specMatches,
      source: 'mock',
    };
  }
}
