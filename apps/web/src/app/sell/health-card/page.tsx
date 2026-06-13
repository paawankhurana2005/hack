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
  return `$${(m.amountCents / 100).toFixed(2)}`;
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
      title="Product Health Card"
      description="The trust layer — verifiable condition, history, and authenticity that travels with the item."
    >
      {status === 'no-input' && (
        <Card>
          <p className="text-sm text-muted">
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
          <p className="text-sm text-orange-500">Issuing the health card…</p>
        </Card>
      )}

      {status === 'error' && (
        <Card className="border-danger/40">
          <p className="text-sm text-danger">{error}</p>
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
                <h2 className="text-xl font-bold text-white">{card.title}</h2>
                <p className="mt-1 text-xs text-muted">Health Card · {card.id}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={gradeTone[card.grade]}>{card.grade}</Badge>
                <Badge tone={card.authenticityVerified ? 'success' : 'neutral'}>
                  {card.authenticityVerified ? '✓ Authenticity verified' : 'Unverified'}
                </Badge>
              </div>
            </div>

            <p className="mt-4 text-sm text-white">{card.summary}</p>
            <p className="mt-1 text-xs text-muted">
              Grading confidence {(card.confidence * 100).toFixed(0)}%
            </p>

            {card.detectedIssues.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted">Condition notes</p>
                <ul className="mt-1 list-inside list-disc text-sm text-muted">
                  {card.detectedIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 border-t border-navy-700 pt-4">
              <p className="text-xs font-medium text-muted">History</p>
              <ol className="mt-2 space-y-2">
                {card.history.map((e) => (
                  <li key={e.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                      {e.label}
                    </span>
                    <span className="text-xs text-muted">{when(e.at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Card>

          <Card>
            {card.listingPrice && (
              <>
                <p className="text-sm text-muted">Listing price</p>
                <p className="mt-1 text-3xl font-bold text-white">{fmt(card.listingPrice)}</p>
              </>
            )}
            <div className="mt-5">
              <p className="text-xs font-medium text-muted">Shareable link</p>
              <p className="mt-1 break-all rounded-md border border-navy-700 bg-navy-900 p-2 text-xs text-muted">
                {card.healthCardUrl}
              </p>
              <Button
                variant="secondary"
                className="mt-3 w-full"
                onClick={() => void copyLink(card.healthCardUrl)}
              >
                {copied ? 'Copied ✓' : 'Copy link'}
              </Button>
              <p className="mt-3 text-xs text-muted">
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
