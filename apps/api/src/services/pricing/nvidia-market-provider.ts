// NVIDIA-hosted text LLM (llama-3.3-70b) acting as a market analyst: estimates a
// product's typical online retail price and local demand. Defensive parsing —
// the deterministic pricing rule downstream will clamp anything unreasonable.

import type { DemandLevel, ItemCategory } from '@reloop/shared';
import type { Config } from '../../config.js';
import { extractJson } from '../nvidia/client.js';
import { callModel } from '../../lib/model-call.js';
import type { MarketEstimate, MarketEstimateInput, MarketProvider } from './types.js';

const SYSTEM_PROMPT = `You are ReLoop's resale market analyst for the INDIAN market.
Given a product, estimate its TYPICAL current retail price on major Indian online
marketplaces (e.g. Amazon.in, Flipkart) when bought new, in Indian Rupees (INR),
and the resale demand for it.

Always give a positive best-estimate price — if the product name is generic or
unfamiliar, estimate from the category. NEVER return 0.

Respond with ONLY a JSON object, no prose and no markdown fences:
{
  "estimatedRetailInr": number (typical NEW retail price in INR, > 0),
  "demand": one of "low" | "high" | "medium",
  "note": one concise sentence on the item's popularity / price context
}`;

const DEMANDS: readonly DemandLevel[] = ['low', 'medium', 'high'];

// Last-resort retail estimate (INR) when the model can't price a generic item.
// Exported so the Sell pipeline's price-stage fallback reuses the same anchors.
export const CATEGORY_DEFAULT_INR: Record<ItemCategory, number> = {
  electronics: 12_000,
  home: 5_000,
  fashion: 4_000,
  sports: 5_000,
  toys: 2_500,
  books: 500,
  other: 4_000,
};

function normalizeDemand(value: unknown): DemandLevel {
  const v = String(value).toLowerCase().trim();
  return DEMANDS.find((d) => d === v) ?? 'medium';
}

function parseInr(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class NvidiaMarketProvider implements MarketProvider {
  constructor(private readonly cfg: Config) {}

  async estimate(input: MarketEstimateInput): Promise<MarketEstimate> {
    const { draft, detectedIssues } = input;
    const userMsg =
      `Product: ${draft.title} (category: ${draft.category}).` +
      (draft.notes ? ` Details: ${draft.notes}.` : '') +
      (detectedIssues.length ? ` Noted wear: ${detectedIssues.join(', ')}.` : '') +
      ' Give the typical new retail price and resale demand.';

    // Routed through the single model-call choke point: timeout + retry-with-nudge
    // (the model sometimes returns 0 or prose for generic titles) + a REQUIRED
    // deterministic category fallback so pricing always produces a usable estimate.
    const { value } = await callModel<MarketEstimate>(this.cfg, {
      request: {
        model: this.cfg.PRICING_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        maxTokens: 256,
      },
      retries: 1,
      nudge:
        'Return ONLY the JSON with a positive estimatedRetailInr (never 0), based on the category if unsure.',
      parse: (content) => {
        const raw = extractJson(content);
        const inr = parseInr(raw.estimatedRetailInr);
        if (inr === null) throw new Error('model returned a non-positive retail estimate');
        const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : '';
        return {
          estimatedRetailCents: Math.round(inr * 100),
          demand: normalizeDemand(raw.demand),
          note: note || `Typical retail for ${draft.category}.`,
        };
      },
      fallback: () => ({
        estimatedRetailCents: CATEGORY_DEFAULT_INR[draft.category] * 100,
        demand: 'medium' as DemandLevel,
        note: `Estimated from the ${draft.category} category.`,
      }),
    });
    return value;
  }
}
