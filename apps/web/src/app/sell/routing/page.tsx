'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Money, PriceRequest } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/section';
import { FlowNav } from '@/components/layout/flow-nav';
import { priceItem, ApiRequestError } from '@/lib/api-client';
import { useSellFlow } from '../sell-flow-context';

type Status = 'no-input' | 'loading' | 'success' | 'error';

const demandTone = { low: 'warning', medium: 'neutral', high: 'success' } as const;

function fmt(m: Money): string {
  return `₹${(m.amountCents / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function SellRoutingPage() {
  const { draft, result, pricing, setPricing, setCard } = useSellFlow();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    if (!result) return;
    setStatus('loading');
    setError('');
    const req: PriceRequest = {
      draft: {
        title: draft.title,
        category: draft.category,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      },
      grade: result.grade,
      detectedIssues: result.detectedIssues,
    };
    try {
      const res = await priceItem(req);
      setPricing(res);
      setCard(null); // a fresh price invalidates any prior card
      setStatus('success');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Pricing failed. Please try again.');
      setStatus('error');
    }
  }, [draft, result, setPricing, setCard]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!result) {
      setStatus('no-input');
      return;
    }
    if (pricing) {
      setStatus('success');
      return;
    }
    void run();
  }, [result, pricing, run]);

  return (
    <PageShell
      eyebrow="Sell / Step 03 · Intelligence"
      title="Pricing & match prep"
      description="A fair resale price, anchored to the item's estimated retail and condition."
    >
      {status === 'no-input' && (
        <Card>
          <p className="text-sm text-muted-foreground">Grade an item first, then we can price it.</p>
          <div className="mt-4">
            <Button href="/sell/grading" variant="secondary">
              ← Back to grading
            </Button>
          </div>
        </Card>
      )}

      {status === 'loading' && (
        <Panel label="/api/sell/price · live trace" status="RUN ●">
          <div className="flex items-center gap-3">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
            <p className="font-mono text-sm text-brand">Estimating a fair price…</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Looking up typical retail and applying the condition discount.
          </p>
        </Panel>
      )}

      {status === 'error' && (
        <Card className="ring-destructive/40">
          <p className="text-sm text-destructive">{error}</p>
          <div className="mt-4 flex gap-3">
            <Button variant="primary" onClick={() => void run()}>
              Try again
            </Button>
            <Button href="/sell/grading" variant="secondary">
              Back to grading
            </Button>
          </div>
        </Card>
      )}

      {status === 'success' && pricing && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Suggested resale price
            </p>
            <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums text-brand">
              {fmt(pricing.suggestedPrice)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="line-through">{fmt(pricing.estimatedRetail)}</span>{' '}
              <span className="text-brand">
                {Math.round(pricing.discountPct * 100)}% off est. retail
              </span>
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Badge tone="accent">{pricing.grade}</Badge>
              <Badge tone={demandTone[pricing.demand]}>{pricing.demand} demand</Badge>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Retail is an AI estimate, not a live marketplace quote.
            </p>
          </Card>

          <Panel label="/api/sell/price · rationale">
            <p className="text-sm text-foreground">{pricing.rationale}</p>
            <div className="mt-4 space-y-px">
              {pricing.factors.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center justify-between border-b border-border/40 py-2"
                >
                  <span className="text-xs text-muted-foreground">{f.label}</span>
                  <span className="font-mono text-xs text-foreground">{f.value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <FlowNav
        prevHref="/sell/grading"
        nextHref={status === 'success' ? '/sell/health-card' : undefined}
      />
    </PageShell>
  );
}
