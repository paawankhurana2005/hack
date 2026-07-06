'use client';

import { useEffect, useRef, useState } from 'react';
import type { RufusContext } from '@reloop/shared';
import { logListingEvent } from '@/lib/api-client';

interface Msg {
  role: 'user' | 'rufus';
  text: string;
}

// DEMO HARDCODE — Rufus answers locally from the Health Card facts (no API call)
// with a fixed ~2s "typing" delay, so the demo is instant and deterministic.
// Each answer only uses what's on the card — the same constraint as the real
// Rufus. To restore the live LLM, re-import `askRufus` and call it in `ask`.
const RUFUS_DELAY_MS = 2000;

/** Join issues into a lower-cased, human list: ["A", "B", "C"] → "a, b and c". */
function listLower(items: string[]): string {
  const xs = items.map((s) => s.toLowerCase());
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Deterministic Rufus answer, drawn only from the item's Health Card context. */
function answerLocally(question: string, ctx: RufusContext): string {
  const q = question.toLowerCase();
  const pct = Math.round(ctx.confidence * 100);
  const issues = ctx.detectedIssues;
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  // Authenticity
  if (has('authentic', 'genuine', 'real', 'fake', 'legit', 'original')) {
    return ctx.authenticityVerified
      ? `Yes — authenticity was verified during AI grading. The photos matched the original ${ctx.title} listing and specs, so it's confirmed genuine.`
      : `Authenticity couldn't be fully confirmed from photos alone — it'll be checked in person at handoff before any money changes hands.`;
  }

  // Price / why cheaper
  if (has('cheap', 'price', 'cost', 'discount', 'expensive', 'worth', 'why so', 'less')) {
    const off =
      ctx.originalPriceInr && ctx.originalPriceInr > 0
        ? Math.round((1 - ctx.listingPriceInr / ctx.originalPriceInr) * 100)
        : null;
    const vsNew =
      ctx.originalPriceInr != null
        ? ` vs ₹${ctx.originalPriceInr.toLocaleString('en-IN')} new${off != null ? ` — about ${off}% off` : ''}`
        : '';
    return `It's ₹${ctx.listingPriceInr.toLocaleString('en-IN')}${vsNew}. It's a second-life item graded ${ctx.grade}${
      issues.length ? ` (${listLower(issues.slice(0, 1))})` : ''
    }, so the price reflects its condition while it still has plenty of life left.`;
  }

  // Environmental impact
  if (has('environment', 'eco', 'co2', 'carbon', 'impact', 'sustain', 'green', 'planet')) {
    const parts: string[] = [];
    if (ctx.co2SavedKg) parts.push(`keeps about ${ctx.co2SavedKg}kg of CO₂ out of the air`);
    if (ctx.ecoCredits) parts.push(`earns you ${ctx.ecoCredits} EcoCredits`);
    return `Buying it second-life ${
      parts.length ? parts.join(' and ') : 'avoids the carbon of manufacturing a brand-new one'
    } — you're giving a working product another life instead of letting it go to waste.`;
  }

  // Specs (size / colour / model)
  if (has('size', 'colour', 'color', 'spec', 'model', 'fit')) {
    const specs = ctx.specs ?? {};
    const entries = Object.entries(specs);
    if (entries.length) {
      return `From its Health Card — ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}.`;
    }
  }

  // Condition (default for "what condition", "wear", "quality", etc.)
  if (has('condition', 'wear', 'state', 'quality', 'shape', 'used', 'damage', 'grade')) {
    return `It's in ${ctx.grade} condition${
      issues.length ? `, with some visible wear — ${listLower(issues)}` : ' — no issues were flagged'
    }. Graded with ${pct}% confidence.`;
  }

  // Generic fallback — summarise the card.
  return `From its Health Card: it's a ${ctx.grade}-condition ${ctx.title}${
    issues.length ? `, with ${listLower(issues)}` : ''
  }. ${ctx.summary}`;
}

/** Small Rufus brand mark — orange pebble + gold sparkle. */
function RufusMark({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center ${className}`} aria-hidden>
      <span className="size-3 rounded-full bg-[#ff7a00]" />
      <span className="-ml-1 text-brand">✦</span>
    </span>
  );
}

function suggestionsFor(ctx: RufusContext): string[] {
  return [
    'What condition is it in?',
    ctx.authenticityVerified ? 'Is it authentic?' : 'How do I know it’s genuine?',
    'Why is it cheaper than new?',
    'What’s the environmental impact?',
  ];
}

export function RufusChat({ context, listingId }: { context: RufusContext; listingId?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setLoading(true);
    // Real engagement signal (spec 024, phase 3) — a genuine buyer question is
    // a stronger intent signal than a page view.
    if (listingId) void logListingEvent(listingId, 'message').catch(() => {});
    // Hardcoded: answer locally from the Health Card after a fixed ~2s delay.
    const text = answerLocally(q, context);
    await new Promise((r) => setTimeout(r, RUFUS_DELAY_MS));
    setMessages((m) => [...m, { role: 'rufus', text }]);
    setLoading(false);
  }

  const chips = suggestionsFor(context);

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-card px-4 py-3 font-medium text-foreground shadow-2xl shadow-black/40 ring-1 ring-border transition hover:ring-brand/50 active:scale-95"
      >
        <RufusMark />
        <span className="text-sm">{open ? 'Close' : 'Ask Rufus'}</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[30rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl bg-card shadow-2xl shadow-black/50 ring-1 ring-border">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <RufusMark />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Ask Rufus</p>
              <p className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Health Card · {context.title}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="flex gap-2">
              <RufusMark className="mt-0.5 shrink-0" />
              <div className="rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-sm text-foreground">
                Hi! I’m Rufus. Ask me anything about this <span className="text-brand">{context.title}</span> — I’ve read its Health Card.
              </div>
            </div>

            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand px-3 py-2 text-sm text-brand-foreground">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-2">
                  <RufusMark className="mt-0.5 shrink-0" />
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-sm text-foreground">
                    {m.text}
                  </div>
                </div>
              ),
            )}

            {loading && (
              <div className="flex items-center gap-2 pl-1 text-muted-foreground">
                <RufusMark className="shrink-0" />
                <span className="flex gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Suggestions */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => void ask(c)}
                  className="rounded-full bg-brand/10 px-3 py-1 text-xs text-brand transition-colors hover:bg-brand/20"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex items-center gap-2 border-t border-border/60 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this item…"
              className="flex-1 rounded-full bg-background px-4 py-2 text-sm text-foreground outline-none ring-1 ring-border focus:ring-brand/50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground transition hover:bg-brand-strong disabled:opacity-40"
            >
              ↑
            </button>
          </form>
        </div>
      )}
    </>
  );
}
