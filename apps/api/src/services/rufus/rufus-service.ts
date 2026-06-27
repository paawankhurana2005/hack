// Rufus answers a shopper's question about ONE second-life item, grounded in its
// Product Health Card. The model is told to use only the supplied facts and to
// admit when it doesn't know. A deterministic fallback keeps it useful offline.

import type { RufusContext, RufusRequest } from '@reloop/shared';
import { buildCorpus, isGrounded, retrieve } from '@reloop/shared';
import type { Config } from '../../config.js';
import { nvidiaChat } from '../nvidia/client.js';

const SYSTEM_PROMPT = `You are Rufus, Amazon's friendly shopping assistant, helping someone consider a
SECOND-HAND item. You are given a SHORT LIST of retrieved facts from the item's
Product Health Card. Rules:
- Answer using ONLY the retrieved facts. Never invent specs, prices, or claims.
- Be concise and conversational — 1 to 2 short sentences, max ~40 words.
- If the facts don't cover the question, say you don't have that detail on the
  Health Card and mention what IS known.
- No markdown, no bullet lists.`;

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
  // 1. Retrieve only the Health-Card facts relevant to the question (RAG).
  const corpus = buildCorpus(req.context);
  const retrieved = retrieve(req.question, corpus, 4);
  if (retrieved.length === 0) return fallbackAnswer(req.context); // nothing relevant

  const facts = retrieved.map((c) => `- ${c.text}`).join('\n');
  try {
    // 2. Ground the answer in ONLY the retrieved facts.
    const text = await nvidiaChat(cfg, {
      model: cfg.PRICING_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Question: ${req.question}\n\nRetrieved Health Card facts (use ONLY these):\n${facts}`,
        },
      ],
      maxTokens: 140,
      temperature: 0.3,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    // 3. Hallucination check: reject answers that assert numbers not in the context.
    if (!cleaned || !isGrounded(cleaned, facts)) return fallbackAnswer(req.context);
    return cleaned;
  } catch {
    return fallbackAnswer(req.context);
  }
}
