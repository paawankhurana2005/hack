// Grading provider backed by OUR trained DINOv2 model, served over HTTP by
// ml/grading/serve.py. Implements the same VlmProvider contract as the hosted-VLM
// provider, so swapping is a one-line change in index.ts (env GRADER=local).

import type { ConditionGrade, DetectedIssue, IssueSeverity } from '@reloop/shared';
import type { VlmAssessment, VlmImageInput, VlmProvider } from './types.js';

const GRADES: readonly ConditionGrade[] = ['new', 'like-new', 'good', 'fair', 'poor'];
const SEVERITIES: readonly IssueSeverity[] = ['minor', 'moderate', 'severe'];

// Severity-ordered (worst → best); index doubles as a rank we can shift.
const GRADE_RANK: readonly ConditionGrade[] = ['poor', 'fair', 'good', 'like-new', 'new'];

// --- Temporary calibration shim (remove/retune after we retrain) -------------
// Our current checkpoint runs pessimistic — it calls lightly-worn items (esp.
// sneakers) "fair"/"poor". Until the next training run fixes the label bias, we
// nudge the model's raw output up by a fixed number of grade steps and soften
// issue severity by one notch. Both are env-tunable so the demo stays consistent
// and we can dial it back to 0 once the model is honest on its own.
//   GRADER_LENIENCY      — grade steps to bump toward "new" (default 1)
//   GRADER_FLOOR         — never report worse than this grade (default "fair")
//   GRADER_SOFTEN_ISSUES — "1" to drop each issue's severity one notch (default on)
const LENIENCY_STEPS = clampInt(process.env.GRADER_LENIENCY, 1, 0, 4);
const GRADE_FLOOR = (GRADE_RANK as readonly string[]).includes(process.env.GRADER_FLOOR ?? '')
  ? (process.env.GRADER_FLOOR as ConditionGrade)
  : 'fair';
const SOFTEN_ISSUES = (process.env.GRADER_SOFTEN_ISSUES ?? '1') !== '0';

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = raw === undefined ? fallback : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Bump a grade up by LENIENCY_STEPS, then enforce the floor. */
function applyLeniency(grade: ConditionGrade): ConditionGrade {
  const bumped = Math.min(GRADE_RANK.length - 1, GRADE_RANK.indexOf(grade) + LENIENCY_STEPS);
  const floored = Math.max(bumped, GRADE_RANK.indexOf(GRADE_FLOOR));
  return GRADE_RANK[floored]!;
}

/** Drop a severity one notch (severe → moderate → minor) when softening is on. */
function softenSeverity(s: IssueSeverity): IssueSeverity {
  if (!SOFTEN_ISSUES) return s;
  return SEVERITIES[Math.max(0, SEVERITIES.indexOf(s) - 1)]!;
}

interface AssessResponse {
  grade: string;
  confidence: number;
  /** The model's raw 0..1 condition score — its actual output, not a bucket. */
  score?: number;
  detectedIssues?: string[];
  structuredIssues?: { type: string; severity: string; region: string }[];
  photoQuality?: string;
  summary?: string;
}

function asGrade(g: string): ConditionGrade {
  return (GRADES as readonly string[]).includes(g) ? (g as ConditionGrade) : 'good';
}

function asSeverity(s: string): IssueSeverity {
  return (SEVERITIES as readonly string[]).includes(s) ? (s as IssueSeverity) : 'moderate';
}

export class LocalModelProvider implements VlmProvider {
  constructor(private readonly baseUrl: string) {}

  async assessImage(input: VlmImageInput): Promise<VlmAssessment> {
    const res = await fetch(`${this.baseUrl}/assess`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64: input.imageBase64 }),
    });
    if (!res.ok) {
      throw new Error(`local grader responded ${res.status}: ${await res.text()}`);
    }
    const j = (await res.json()) as AssessResponse;
    const structuredIssues: DetectedIssue[] = (j.structuredIssues ?? []).map((d) => ({
      type: d.type,
      severity: softenSeverity(asSeverity(d.severity)),
      region: d.region || 'overall',
    }));
    const photoQuality = (['clear', 'blurry', 'dark', 'occluded'] as const).includes(
      j.photoQuality as never,
    )
      ? (j.photoQuality as VlmAssessment['photoQuality'])
      : 'clear';
    return {
      grade: applyLeniency(asGrade(j.grade)),
      confidence: typeof j.confidence === 'number' ? j.confidence : 0.5,
      ...(typeof j.score === 'number' ? { score: j.score } : {}),
      detectedIssues: j.detectedIssues ?? structuredIssues.map((d) => d.type),
      structuredIssues,
      photoQuality,
      summary: j.summary ?? 'Graded by the ReLoop model.',
    };
  }
}
