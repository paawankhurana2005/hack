// NVIDIA-hosted text LLM (llama-3.3-70b) acting as a market analyst: estimates a
// product's typical online retail price and local demand. Defensive parsing —
// the deterministic pricing rule downstream will clamp anything unreasonable.

import type { DemandLevel, ItemCategory } from '@reloop/shared';
import type { Config } from '../../config.js';
import { extractJson, nvidiaChat } from '../nvidia/client.js';
import type { MarketEstimate, MarketEstimateInput, MarketProvider } from './types.js';

const SYSTEM_PROMPT = `You are ReLoop's resale market analyst. Given a product,
estimate its TYPICAL current retail price on major online marketplaces (e.g.
Amazon) when bought new, in US dollars, and the resale demand for it.

Always give a positive best-estimate price — if the product name is generic or
unfamiliar, estimate from the category. NEVER return 0.

Respond with ONLY a JSON object, no prose and no markdown fences:
{
  "estimatedRetailUsd": number (typical NEW retail price in USD, > 0),
  "demand": one of "low" | "high" | "medium",
  "note": one concise sentence on the item's popularity / price context
}`;

const DEMANDS: readonly DemandLevel[] = ['low', 'medium', 'high'];

// Last-resort retail estimate (USD) when the model can't price a generic item.
const CATEGORY_DEFAULT_USD: Record<ItemCategory, number> = {
  electronics: 150,
  home: 60,
  fashion: 50,
  sports: 60,
  toys: 30,
  books: 20,
  other: 50,
};

function normalizeDemand(value: unknown): DemandLevel {
  const v = String(value).toLowerCase().trim();
  return DEMANDS.find((d) => d === v) ?? 'medium';
}

function parseUsd(value: unknown): number | null {
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

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: userMsg },
    ];

    // Try twice; the model sometimes returns 0 or prose for generic titles.
    let demand: DemandLevel = 'medium';
    let note = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reqMessages =
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: 'user' as const,
                content:
                  'Return ONLY the JSON with a positive estimatedRetailUsd (never 0), based on the category if unsure.',
              },
            ];
      try {
        const content = await nvidiaChat(this.cfg, {
          model: this.cfg.PRICING_MODEL,
          messages: reqMessages,
          maxTokens: 256,
        });
        const raw = extractJson(content);
        demand = normalizeDemand(raw.demand);
        note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : note;
        const usd = parseUsd(raw.estimatedRetailUsd);
        if (usd !== null) {
          return { estimatedRetailCents: Math.round(usd * 100), demand, note };
        }
      } catch {
        // fall through to retry / category fallback
      }
    }

    // Category fallback so pricing always produces a usable estimate.
    const fallback = CATEGORY_DEFAULT_USD[draft.category];
    return {
      estimatedRetailCents: fallback * 100,
      demand,
      note: note || `Estimated from the ${draft.category} category.`,
    };
  }
}
