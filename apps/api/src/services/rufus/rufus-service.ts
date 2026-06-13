// Rufus answers a shopper's question about ONE second-life item, grounded in its
// Product Health Card. The model is told to use only the supplied facts and to
// admit when it doesn't know. A deterministic fallback keeps it useful offline.

import type { RufusContext, RufusRequest } from '@reloop/shared';
import type { Config } from '../../config.js';
import { nvidiaChat } from '../nvidia/client.js';

const SYSTEM_PROMPT = `You are Rufus, Amazon's friendly shopping assistant, helping someone consider a
SECOND-HAND item. Answer their question using ONLY the item's Health Card facts
provided as JSON. Rules:
- Be concise and conversational — 1 to 2 short sentences, max ~40 words.
- Be honest about condition and any noted issues; never invent specs or claims.
- If the facts don't cover the question, say you don't have that detail on the
  Health Card and suggest what is known.
- You may reason lightly (e.g. a "good"-grade item is fine for everyday use), but
  ground it in the facts. No markdown, no bullet lists.`;

function inr(n: number | undefined): string {
  return n === undefined ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function fallbackAnswer(ctx: RufusContext): string {
  const discount =
    ctx.originalPriceInr && ctx.originalPriceInr > ctx.listingPriceInr
      ? ` — about ${Math.round((1 - ctx.listingPriceInr / ctx.originalPriceInr) * 100)}% off ${inr(
          ctx.originalPriceInr,
        )} new`
      : '';
  const issues = ctx.detectedIssues.length
    ? ` Noted wear: ${ctx.detectedIssues.join(', ')}.`
    : ' No issues were flagged.';
  const auth = ctx.authenticityVerified ? ' Authenticity is verified.' : '';
  return `This ${ctx.title} is graded ${ctx.grade} at ${inr(
    ctx.listingPriceInr,
  )}${discount}.${issues}${auth}`;
}

export async function answerRufus(cfg: Config, req: RufusRequest): Promise<string> {
  const userMsg = JSON.stringify({
    question: req.question,
    healthCard: req.context,
  });
  try {
    const text = await nvidiaChat(cfg, {
      model: cfg.PRICING_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      maxTokens: 140,
      temperature: 0.4,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    return cleaned || fallbackAnswer(req.context);
  } catch {
    return fallbackAnswer(req.context);
  }
}
