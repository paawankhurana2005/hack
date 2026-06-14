'use client';

import { useState } from 'react';
import type { DormantSignal } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';
import { formatDistance, quote, recordBooking } from '@/lib/mesh';

/**
 * The proactive Mesh nudge: a dormant item the owner already has, matched to a
 * neighbor who wants it now. "Lend it" brokers the loan — the item never moves to
 * a warehouse, and the payout lands in the owner's Rewards.
 */
export function DormantCard({
  signal,
  onLent,
}: {
  signal: DormantSignal;
  onLent?: () => void;
}) {
  const top = signal.demand[0]!;
  const q = quote(signal.suggestedDailyRate, signal.deposit, signal.newPrice, top.days);
  const [lent, setLent] = useState(false);

  function lend() {
    recordBooking({
      role: 'lend',
      title: signal.title,
      imageUrl: signal.imageUrl,
      counterpartyName: top.borrowerName,
      days: top.days,
      dailyRate: signal.suggestedDailyRate,
      total: q.total,
      deposit: signal.deposit,
      platformFee: q.platformFee,
      lenderNet: q.lenderNet,
    });
    setLent(true);
    onLent?.();
  }

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="relative aspect-[4/3] overflow-hidden bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signal.imageUrl} alt={signal.title} className="h-full w-full object-contain p-5" />
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
          Idle {signal.idleMonths} months
        </span>
        {signal.demand.length > 0 && (
          <span className="absolute right-3 top-3">
            <Badge tone="accent">
              {signal.demand.length} want{signal.demand.length === 1 ? 's' : ''} it nearby
            </Badge>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold tracking-tight text-foreground">{signal.title}</h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Bought for {formatMoney(signal.newPrice)} · untouched
        </p>

        {/* The match — a real neighbor, a real reason */}
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-3">
          <p className="text-sm text-foreground">
            <span className="font-semibold text-brand">{top.borrowerName}</span>, {formatDistance(top.distanceM)} away,
            wants it for {top.purpose.toLowerCase()}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {top.days} days · {formatMoney(signal.suggestedDailyRate)}/day
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-background/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">You earn</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-brand">{formatMoney(q.lenderNet)}</p>
          </div>
          <div className="rounded-lg bg-background/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">~ / month</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
              {formatMoney(signal.projectedMonthlyEarn)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex-1" />

        {lent ? (
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Lending confirmed</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Amazon will broker the handoff with {top.borrowerName} and hold the deposit. You’ll net{' '}
              {formatMoney(q.lenderNet)} — it’s in your Rewards.
            </p>
          </div>
        ) : (
          <Button variant="primary" className="w-full" onClick={lend}>
            Lend it → earn {formatMoney(q.lenderNet)}
          </Button>
        )}
      </div>
    </Card>
  );
}
