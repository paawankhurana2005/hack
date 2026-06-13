// NVIDIA-hosted VLM provider (OpenAI-compatible chat API).
// Sends one item photo + a condition-assessment prompt and parses the model's
// JSON back into a VlmAssessment. Defensive throughout: a misbehaving model must
// never crash the server or fabricate a silent grade.

import type { ConditionGrade } from '@reloop/shared';
import type { Config } from '../../config.js';
import { extractJson, nvidiaChat, type ChatContentPart } from '../nvidia/client.js';
import type { VlmAssessment, VlmImageInput, VlmProvider } from './types.js';

const GRADES: readonly ConditionGrade[] = ['new', 'like-new', 'good', 'fair', 'poor'];

const SYSTEM_PROMPT = `You are ReLoop's product condition grader ("the eyes").
You assess the physical condition of a used item from photos so it can be resold.
Be objective and specific about visible wear.

Respond with ONLY a JSON object, no prose and no markdown fences, of the form:
{
  "grade": one of "new" | "like-new" | "good" | "fair" | "poor",
  "confidence": number between 0 and 1,
  "detectedIssues": array of short strings describing visible flaws (empty if none),
  "summary": one concise plain-English sentence describing overall condition
}
Grade meaning: "new" = unused/pristine, "like-new" = barely used no visible wear,
"good" = light wear, "fair" = clear wear but functional, "poor" = heavy damage.`;

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

function normalizeIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter((s) => s.length > 0).slice(0, 12);
}

export class NvidiaVlmProvider implements VlmProvider {
  constructor(private readonly cfg: Config) {}

  async assessImage(input: VlmImageInput): Promise<VlmAssessment> {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
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
                content:
                  'Respond with ONLY the JSON object described — no prose, no markdown.',
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
      return {
        grade,
        confidence: normalizeConfidence(raw.confidence, grade),
        detectedIssues: normalizeIssues(raw.detectedIssues),
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
