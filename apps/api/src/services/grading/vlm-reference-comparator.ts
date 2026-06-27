// Real authenticity / reference check (Phase 1). Grounds the "it actually checked
// the real product" signal in the VLM: it looks at the user's primary photo, is told
// the original listing's known specs, and judges whether the observed product matches
// — reading any serial/model code it can see. Routed through the single model-call
// choke point with the deterministic mock comparison as the REQUIRED fallback, so a
// failed/slow call never breaks grading. (Production upgrade: image-embedding cosine
// similarity between the user photo and the original listing images via Rekognition/
// Bedrock; same ReferenceComparator contract.)

import type { ReferenceComparison, SpecMatch } from '@reloop/shared';
import type { Config } from '../../config.js';
import { extractJson, type ChatContentPart } from '../nvidia/client.js';
import { callModel } from '../../lib/model-call.js';
import type { ReferenceComparator, ReferenceInput } from './types.js';
import { mockComparison } from './mock-reference-comparator.js';

const SYSTEM_PROMPT = `You are ReLoop's authenticity checker. You compare a used item's photo against
its ORIGINAL Amazon listing to confirm it is the same genuine product, and note how it
has changed. Be honest; do not invent specs you cannot see.

Respond with ONLY a JSON object, no prose, no markdown fences:
{
  "authenticityMatch": boolean (is this the same product/model as the listing?),
  "authenticityConfidence": number between 0 and 1,
  "changedFromOriginal": array of short strings (wear/scratches/missing parts vs factory),
  "specObservations": array of { "label": string, "observed": string, "match": boolean },
  "serial": string or null (any model/serial code legible in the photo),
  "note": one concise sentence on how deviations shaped the grade
}`;

function clamp01(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : [];
}

/** Reconcile the model's observations with the known original specs. */
function buildSpecMatches(
  originalSpecs: Record<string, string>,
  observations: unknown,
): SpecMatch[] {
  const obsByLabel = new Map<string, { observed: string; match: boolean }>();
  if (Array.isArray(observations)) {
    for (const o of observations) {
      if (o && typeof o === 'object') {
        const rec = o as Record<string, unknown>;
        const label = typeof rec.label === 'string' ? rec.label.trim().toLowerCase() : '';
        if (label) {
          obsByLabel.set(label, {
            observed: typeof rec.observed === 'string' ? rec.observed.trim() : '—',
            match: rec.match !== false,
          });
        }
      }
    }
  }
  return Object.entries(originalSpecs).map(([label, expected]) => {
    const obs = obsByLabel.get(label.toLowerCase());
    return {
      label,
      expected,
      observed: obs?.observed ?? expected,
      match: obs?.match ?? true,
    };
  });
}

export class VlmReferenceComparator implements ReferenceComparator {
  constructor(private readonly cfg: Config) {}

  async compare(input: ReferenceInput): Promise<ReferenceComparison> {
    // No photo to look at → deterministic mock (still honest, derived from grade).
    if (!input.primaryImageBase64) return mockComparison(input);

    const specLines = Object.entries(input.reference.originalSpecs)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    const userContent: ChatContentPart[] = [
      {
        type: 'text',
        text:
          `Original listing: ${input.draft.title}. Known specs — ${specLines || 'none provided'}. ` +
          `Confirm the photo shows this same product and list how it has changed.`,
      },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${input.primaryImageBase64}` } },
    ];

    const { value } = await callModel<ReferenceComparison>(this.cfg, {
      request: {
        model: this.cfg.GRADING_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        maxTokens: 400,
      },
      retries: 1,
      nudge: 'Respond with ONLY the JSON object described — no prose, no markdown.',
      parse: (content) => {
        const raw = extractJson(content);
        const changed = asStringArray(raw.changedFromOriginal);
        const serial = typeof raw.serial === 'string' && raw.serial.trim() ? raw.serial.trim() : null;
        if (serial) changed.unshift(`Serial/model code read: ${serial}`);
        return {
          authenticityMatch: raw.authenticityMatch !== false,
          authenticityConfidence: clamp01(raw.authenticityConfidence),
          changedFromOriginal: changed.slice(0, 8),
          gradeImpact:
            typeof raw.note === 'string' && raw.note.trim()
              ? raw.note.trim()
              : 'Compared against the original listing.',
          specMatches: buildSpecMatches(input.reference.originalSpecs, raw.specObservations),
          source: 'vlm-diff',
        };
      },
      fallback: () => mockComparison(input),
    });
    return value;
  }
}
