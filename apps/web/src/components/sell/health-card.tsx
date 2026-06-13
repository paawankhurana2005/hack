'use client';

import { useState } from 'react';
import type { Money, ProductHealthCard } from '@reloop/shared';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';

const gradeTone = {
  new: 'success',
  'like-new': 'success',
  good: 'accent',
  fair: 'warning',
  poor: 'danger',
} as const;

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Buyer-facing trust card — the showpiece. Reused in review + confirmed. */
export function HealthCard({
  card,
  originalPrice,
  referenceMatch,
}: {
  card: ProductHealthCard;
  originalPrice?: Money;
  referenceMatch?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const discountPct =
    originalPrice && card.listingPrice
      ? Math.round((1 - card.listingPrice.amountCents / originalPrice.amountCents) * 100)
      : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(card.healthCardUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="relative">
      <div className="absolute -inset-8 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative rotate-[-1deg] rounded-[28px] bg-background p-1 shadow-2xl shadow-black/50 ring-1 ring-border transition-transform duration-500 hover:rotate-0">
        <div className="rounded-[24px] bg-card p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Product Health Card
              </div>
              <div className="mt-1 font-mono text-sm tracking-tight text-foreground">{card.id}</div>
            </div>
            {card.authenticityVerified && (
              <div className="grid size-12 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-[10px] font-semibold text-brand">
                VFD
              </div>
            )}
          </div>

          <h3 className="mt-4 text-xl font-semibold tracking-tight text-foreground">{card.title}</h3>

          {/* Verdict */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={gradeTone[card.grade]}>{card.grade}</Badge>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Confidence <span className="text-brand">{(card.confidence * 100).toFixed(0)}%</span>
            </span>
            {card.authenticityVerified ? (
              <Badge tone="success">✓ Authenticity verified</Badge>
            ) : referenceMatch ? (
              <Badge tone="accent">✓ Matches original listing</Badge>
            ) : null}
          </div>

          {/* Summary */}
          <p className="mt-4 text-sm text-foreground">{card.summary}</p>

          {/* Price */}
          {card.listingPrice && (
            <div className="mt-5 flex items-end justify-between border-y border-border/60 py-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Listing price
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-brand">
                  {formatMoney(card.listingPrice)}
                </p>
              </div>
              {discountPct !== null && discountPct > 0 && (
                <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {discountPct}% off original
                </p>
              )}
            </div>
          )}

          {/* Detected issues (honest) */}
          {card.detectedIssues.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Condition notes
              </p>
              <ul className="mt-2 space-y-1.5">
                {card.detectedIssues.slice(0, 4).map((issue) => (
                  <li key={issue} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timeline */}
          <div className="mt-5 rounded-xl bg-background/60 p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-brand">History</p>
            <ol className="relative space-y-3 pl-4">
              <span className="absolute bottom-1 left-[5px] top-1 w-px bg-border" />
              {card.history.map((e) => (
                <li key={e.label} className="relative flex items-center justify-between text-sm">
                  <span className="flex items-center gap-3 text-foreground">
                    <span className="absolute -left-4 size-2 rounded-full bg-brand ring-2 ring-card" />
                    {e.label}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{when(e.at)}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Stamped footer + share */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-widest text-muted-foreground">
              Stamped {when(card.issuedAt)}
              <br />
              Status · <span className="text-brand">Second_life_ready</span>
            </p>
            <button
              type="button"
              onClick={copy}
              className="rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-brand hover:text-brand"
            >
              {copied ? 'Link copied ✓' : 'Copy share link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
