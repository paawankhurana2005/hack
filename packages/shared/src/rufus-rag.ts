// Rufus retrieval-augmented generation (Phase 5). Instead of dumping the whole
// Health Card into one prompt, we build a small corpus of fact CHUNKS, retrieve only
// those relevant to the question, ground the answer in them, and verify the answer
// doesn't fabricate numbers before returning it. Pure + deterministic retrieval
// (token overlap + IDF) — the local stand-in for OpenSearch / Bedrock Knowledge
// Bases vector search; same retrieve(question, corpus) contract.

import type { RufusContext } from './rufus.js';

export interface RufusChunk {
  id: string;
  text: string;
}

const STOP = new Set([
  'the', 'a', 'an', 'is', 'it', 'this', 'that', 'of', 'for', 'to', 'and', 'or', 'in',
  'on', 'are', 'be', 'how', 'do', 'i', 'you', 'me', 'my', 'whats', 'what', 'its', 'with',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9₹%. ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Build the retrievable corpus from a Health Card context. One fact per chunk. */
export function buildCorpus(ctx: RufusContext): RufusChunk[] {
  const chunks: RufusChunk[] = [];
  const pct = Math.round(ctx.confidence * 100);
  chunks.push({ id: 'grade', text: `Condition grade ${ctx.grade} at ${pct}% confidence. ${ctx.summary}` });

  ctx.detectedIssues.forEach((issue, i) => {
    chunks.push({ id: `issue_${i}`, text: `Noted wear: ${issue}.` });
  });
  if (ctx.detectedIssues.length === 0) {
    chunks.push({ id: 'noissues', text: 'No issues or visible wear were flagged during grading.' });
  }

  chunks.push({
    id: 'auth',
    text: ctx.authenticityVerified
      ? `Authenticity verified — photos matched the original ${ctx.title} listing and specs.`
      : `Authenticity was not fully verified from photos; it is checked in person at handoff.`,
  });

  const off =
    ctx.originalPriceInr && ctx.originalPriceInr > ctx.listingPriceInr
      ? ` That is about ${Math.round((1 - ctx.listingPriceInr / ctx.originalPriceInr) * 100)}% off the ₹${Math.round(ctx.originalPriceInr).toLocaleString('en-IN')} new price.`
      : '';
  chunks.push({ id: 'price', text: `Listed at ₹${Math.round(ctx.listingPriceInr).toLocaleString('en-IN')}.${off}` });

  if (ctx.co2SavedKg || ctx.ecoCredits) {
    chunks.push({
      id: 'eco',
      text: `Buying it second-life saves about ${ctx.co2SavedKg ?? 0}kg CO2${
        ctx.ecoCredits ? ` and earns ${ctx.ecoCredits} EcoCredits` : ''
      }.`,
    });
  }
  if (ctx.sellerName) chunks.push({ id: 'seller', text: `Currently sold by ${ctx.sellerName}.` });

  for (const [k, v] of Object.entries(ctx.specs ?? {})) {
    chunks.push({ id: `spec_${k}`, text: `${k}: ${v}.` });
  }
  (ctx.priorQa ?? []).forEach((qa, i) => {
    chunks.push({ id: `qa_${i}`, text: `Earlier the shopper asked "${qa.q}" — answer: ${qa.a}` });
  });

  return chunks;
}

/** Retrieve the top-k chunks for a question (token overlap weighted by IDF). Returns
 *  [] when nothing is relevant — the caller then uses the deterministic fallback. */
export function retrieve(question: string, chunks: RufusChunk[], k = 4): RufusChunk[] {
  const qTokens = new Set(tokenize(question));
  if (qTokens.size === 0 || chunks.length === 0) return [];

  // Document frequency for IDF (rarer terms count more).
  const df = new Map<string, number>();
  const docTokens = chunks.map((c) => {
    const toks = new Set(tokenize(c.text));
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
    return toks;
  });
  const N = chunks.length;

  const scored = chunks.map((c, i) => {
    let score = 0;
    for (const t of qTokens) {
      if (docTokens[i]!.has(t)) score += Math.log(1 + N / (df.get(t) ?? 1));
    }
    return { chunk: c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.chunk);
}

/** Grounding / hallucination check: every number the answer asserts must appear in
 *  the retrieved context, and the answer must be non-empty. Cheap but effective at
 *  catching fabricated prices/specs. */
export function isGrounded(answer: string, contextText: string): boolean {
  const a = answer.trim();
  if (!a) return false;
  const ctxNums = new Set((contextText.match(/\d+/g) ?? []));
  const ansNums = answer.match(/\d+/g) ?? [];
  // Allow tiny standalone numbers (e.g. "1-2 sentences" artifacts) but require any
  // multi-digit figure (prices, percents, sizes) to be backed by the context.
  return ansNums.every((n) => n.length < 2 || ctxNums.has(n));
}
