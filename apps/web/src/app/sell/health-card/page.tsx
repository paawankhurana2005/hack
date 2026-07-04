'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HealthCardRequest, Money } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FlowNav } from '@/components/layout/flow-nav';
import { createHealthCard, ApiRequestError } from '@/lib/api-client';
import { useSellFlow } from '../sell-flow-context';

type Status = 'no-input' | 'loading' | 'success' | 'error';

const gradeTone = {
  new: 'success',
  'like-new': 'success',
  good: 'accent',
  fair: 'warning',
  poor: 'danger',
} as const;

function fmt(m: Money): string {
  return `₹${(m.amountCents / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function SellHealthCardPage() {
  const { draft, result, pricing, card, setCard } = useSellFlow();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    if (!result || !pricing) return;
    setStatus('loading');
    setError('');
    const req: HealthCardRequest = {
      draft: {
        title: draft.title,
        category: draft.category,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      },
      grading: result,
      pricing,
    };
    try {
      const res = await createHealthCard(req);
      setCard(res);
      setStatus('success');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not issue the health card.');
      setStatus('error');
    }
  }, [draft, result, pricing, setCard]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!result || !pricing) {
      setStatus('no-input');
      return;
    }
    if (card) {
      setStatus('success');
      return;
    }
    void run();
  }, [result, pricing, card, run]);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  }

  return (
    <PageShell
      eyebrow="Sell / Step 04 · Trust"
      title="Product Health Card"
      description="The trust layer — verifiable condition, history, and authenticity that travels with the item."
    >
      {status === 'no-input' && (
        <Card>
          <p className="text-sm text-muted-foreground">
            We need a grade and a price first. Step back through grading and pricing.
          </p>
          <div className="mt-4">
            <Button href="/sell/routing" variant="secondary">
              ← Back to pricing
            </Button>
          </div>
        </Card>
      )}

      {status === 'loading' && (
        <Card>
          <div className="flex items-center gap-3">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
            <p className="font-mono text-sm text-brand">Issuing the health card…</p>
          </div>
        </Card>
      )}

      {status === 'error' && (
        <Card className="ring-destructive/40">
          <p className="text-sm text-destructive">{error}</p>
          <div className="mt-4 flex gap-3">
            <Button variant="primary" onClick={() => void run()}>
              Try again
            </Button>
            <Button href="/sell/routing" variant="secondary">
              Back to pricing
            </Button>
          </div>
        </Card>
      )}

      {status === 'success' && card && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Health Card · {card.id}
                </span>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                  {card.title}
                </h2>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={gradeTone[card.grade]}>{card.grade}</Badge>
                <Badge tone={card.authenticityVerified ? 'success' : 'neutral'}>
                  {card.authenticityVerified ? '✓ Authenticity verified' : 'Unverified'}
                </Badge>
              </div>
            </div>

            <p className="mt-4 text-sm text-foreground">{card.summary}</p>
            <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Grading confidence
              </span>
              <span className="font-mono text-sm text-brand">
                {(card.confidence * 100).toFixed(0)}%
              </span>
            </div>

            {card.detectedIssues.length > 0 && (
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Condition notes
                </p>
                <ul className="mt-2 space-y-1.5">
                  {card.detectedIssues.map((issue) => (
                    <li key={issue} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 rounded-xl bg-surface p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-brand">
                Timeline
              </p>
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
          </Card>

          <Card>
            {card.listingPrice && (
              <>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Listing price
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-brand">
                  {fmt(card.listingPrice)}
                </p>
              </>
            )}
            <div className="mt-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Shareable link
              </p>
              <p className="mt-2 break-all rounded-lg border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
                {card.healthCardUrl}
              </p>
              <Button
                variant="secondary"
                className="mt-3 w-full"
                onClick={() => void copyLink(card.healthCardUrl)}
              >
                {copied ? 'Copied ✓' : 'Copy link'}
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                This card travels with the item to its next owner.
              </p>
            </div>
          </Card>
        </div>
      )}

      <FlowNav
        prevHref="/sell/routing"
        nextHref={status === 'success' ? '/sell/handoff' : undefined}
      />
    </PageShell>
  );
}
