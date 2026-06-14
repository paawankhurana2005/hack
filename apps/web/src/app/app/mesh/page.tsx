'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DormantSignal, Money } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { GridBackdrop } from '@/components/ui/section';
import { DormantCard } from '@/components/mesh/dormant-card';
import { ListingCard } from '@/components/mesh/listing-card';
import { formatMoney } from '@/lib/money';
import { useRole } from '@/lib/role-context';
import { getDormantItems, meshListings } from '@/mock/mesh';

type Tab = 'lend' | 'borrow';

const inr = (paise: number): Money => ({ amountCents: paise, currency: 'INR' });

function sumMonthly(items: DormantSignal[]): Money {
  return inr(items.reduce((t, d) => t + d.projectedMonthlyEarn.amountCents, 0));
}

export default function MeshPage() {
  const { accountId } = useRole();
  const [tab, setTab] = useState<Tab>('lend');
  const [dormant, setDormant] = useState<DormantSignal[]>([]);
  // Bumps when a lend is confirmed so the passive-income hero re-reads.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!accountId) return;
    setDormant(getDormantItems(accountId));
  }, [accountId]);

  const monthly = useMemo(() => sumMonthly(dormant), [dormant]);

  return (
    <PageShell
      eyebrow="Amazon Mesh · hyperlocal lending"
      title="The stuff you own, working for you"
      description="Mesh turns the things sitting idle in your home into income — and lets you borrow what your neighbors already own instead of buying new. A return loop, eliminated: no new inventory, no warehouse."
    >
      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        {(['lend', 'borrow'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              tab === t
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-border text-muted-foreground hover:text-brand'
            }`}
          >
            {t === 'lend' ? `Lend · ${dormant.length} idle` : `Borrow nearby · ${meshListings.length}`}
          </button>
        ))}
      </div>

      {tab === 'lend' ? (
        <>
          {/* Passive-income hero */}
          <div className="relative mb-8 overflow-hidden rounded-3xl bg-card p-8 ring-1 ring-border">
            <GridBackdrop />
            <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-brand/10 blur-[120px]" />
            <div className="relative">
              <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                Idle inventory · projected passive income
              </p>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-6xl font-semibold tracking-tighter tabular-nums text-brand [text-shadow:0_0_40px_rgba(234,179,8,0.35)]">
                  {formatMoney(monthly)}
                </span>
                <span className="pb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  / month
                </span>
              </div>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                Mesh scanned your purchases and found {dormant.length} thing
                {dormant.length === 1 ? '' : 's'} you haven’t touched in months — each one wanted by
                someone nearby right now.
              </p>
            </div>
          </div>

          {dormant.length === 0 ? (
            <Card className="border border-dashed border-border ring-0">
              <p className="text-sm text-muted-foreground">
                Nothing of yours is sitting idle right now — Mesh will nudge you when something is.
              </p>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {dormant.map((d) => (
                <DormantCard key={d.id} signal={d} onLent={() => setVersion((v) => v + 1)} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
            Need something for a weekend, a trip, or a one-off? Borrow it from a verified neighbor for
            a fraction of buying new. Amazon brokers the handoff, holds the deposit, and covers it with
            buyer protection.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {meshListings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
