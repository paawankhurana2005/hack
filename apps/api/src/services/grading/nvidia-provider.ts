// NVIDIA-hosted VLM provider (OpenAI-compatible chat API).
// Sends one item photo + a CATEGORY-CONDITIONED condition-assessment prompt and
// parses the model's structured JSON into a VlmAssessment. Defensive throughout: a
// misbehaving model must never crash the server or fabricate a silent grade. The
// model perceives (grade, structured issues, capture quality); all aggregation and
// calibration happens deterministically downstream.

import type { ConditionGrade, DetectedIssue, IssueSeverity, PhotoQuality } from '@reloop/shared';
import { rubricFor } from '@reloop/shared';
import type { Config } from '../../config.js';
import { extractJson, nvidiaChat, type ChatContentPart } from '../nvidia/client.js';
import type { VlmAssessment, VlmImageInput, VlmProvider } from './types.js';

const GRADES: readonly ConditionGrade[] = ['new', 'like-new', 'good', 'fair', 'poor'];
const SEVERITIES: readonly IssueSeverity[] = ['minor', 'moderate', 'severe'];
const QUALITIES: readonly PhotoQuality[] = ['clear', 'blurry', 'dark', 'occluded'];

function buildSystemPrompt(issueTypes: string[], regions: string[]): string {
  return `You are ReLoop's product condition grader ("the eyes").
You assess the physical condition of a used item from a photo so it can be resold.
Be objective and specific about visible wear.

Classify each visible flaw using these issue types where they fit: ${issueTypes.join(', ')}.
Localize each flaw to one of these regions: ${regions.join(', ')}.
Also judge the PHOTO's capture quality so we know if we can trust the assessment.

Respond with ONLY a JSON object, no prose and no markdown fences:
{
  "grade": one of "new" | "like-new" | "good" | "fair" | "poor",
  "confidence": number between 0 and 1,
  "issues": array of { "type": short string, "severity": "minor"|"moderate"|"severe", "region": short string },
  "photoQuality": one of "clear" | "blurry" | "dark" | "occluded",
  "summary": one concise plain-English sentence describing overall condition
}
Grade meaning: "new" = unused/pristine, "like-new" = barely used no visible wear,
"good" = light wear, "fair" = clear wear but functional, "poor" = heavy damage.
Use [] for issues when none are visible.`;
}

function buildUserContent(input: VlmImageInput): ChatContentPart[] {
  const { draft, imageBase64 } = input;
  const intro =
    `Item: ${draft.title} (category: ${draft.category}).` +
    (draft.notes ? ` Seller notes: ${draft.notes}.` : '') +
    ' Grade its condition from this photo.';

  return [
    { type: 'text', text: intro },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
  ];
}

function normalizeGrade(value: unknown): ConditionGrade {
  const v = String(value).toLowerCase().trim();
  const match = GRADES.find((g) => g === v);
  if (match) return match;
  throw new Error(`model returned unknown grade: ${String(value)}`);
}

function normalizeConfidence(value: unknown, grade: ConditionGrade): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  // Coarse, honest fallback when the model omits/garbles confidence: extreme
  // grades read more confidently than the ambiguous middle.
  const coarse: Record<ConditionGrade, number> = {
    new: 0.7,
    'like-new': 0.65,
    good: 0.6,
    fair: 0.6,
    poor: 0.7,
  };
  return coarse[grade];
}

function normalizeSeverity(value: unknown): IssueSeverity {
  const v = String(value).toLowerCase().trim();
  return SEVERITIES.find((s) => s === v) ?? 'moderate';
}

function normalizeQuality(value: unknown): PhotoQuality {
  const v = String(value).toLowerCase().trim();
  return QUALITIES.find((q) => q === v) ?? 'clear';
}

/** Parse the model's `issues` array into structured defects, tolerant of shape. */
function normalizeIssues(value: unknown): DetectedIssue[] {
  if (!Array.isArray(value)) return [];
  const out: DetectedIssue[] = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t) out.push({ type: t, severity: 'moderate', region: 'unspecified' });
    } else if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      const type = typeof o.type === 'string' ? o.type.trim() : '';
      if (type) {
        out.push({
          type,
          severity: normalizeSeverity(o.severity),
          region: typeof o.region === 'string' && o.region.trim() ? o.region.trim() : 'unspecified',
        });
      }
    }
    if (out.length >= 12) break;
  }
  return out;
}

/** Human string for back-compat detectedIssues[]: "screen scratch (severe, screen)". */
export function issueToString(i: DetectedIssue): string {
  const where = i.region && i.region !== 'unspecified' ? `, ${i.region}` : '';
  return `${i.type} (${i.severity}${where})`;
}

export class NvidiaVlmProvider implements VlmProvider {
  constructor(private readonly cfg: Config) {}

  async assessImage(input: VlmImageInput): Promise<VlmAssessment> {
    const rubric = rubricFor(input.draft.category);
    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(rubric.issueTypes, rubric.regions) },
      { role: 'user' as const, content: buildUserContent(input) },
    ];

    // The VLM occasionally answers in prose; retry once with a firm nudge.
    let lastContent = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reqMessages =
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: 'user' as const,
                content: 'Respond with ONLY the JSON object described — no prose, no markdown.',
              },
            ];
      lastContent = await nvidiaChat(this.cfg, {
        model: this.cfg.GRADING_MODEL,
        messages: reqMessages,
      });
      const parsed = this.tryParse(lastContent);
      if (parsed) return parsed;
    }

    throw new Error(`model did not return JSON. Got: ${lastContent.slice(0, 150)}`);
  }

  /** Parse + normalize model output; returns null if it isn't valid JSON. */
  private tryParse(content: string): VlmAssessment | null {
    try {
      const raw = extractJson(content);
      const grade = normalizeGrade(raw.grade);
      const structuredIssues = normalizeIssues(raw.issues);
      return {
        grade,
        confidence: normalizeConfidence(raw.confidence, grade),
        structuredIssues,
        detectedIssues: structuredIssues.map(issueToString),
        photoQuality: normalizeQuality(raw.photoQuality),
        summary:
          typeof raw.summary === 'string' && raw.summary.trim()
            ? raw.summary.trim()
            : 'Condition assessed from the provided photos.',
      };
    } catch {
      return null;
    }
  }
}
