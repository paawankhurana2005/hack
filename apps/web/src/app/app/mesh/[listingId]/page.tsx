'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';
import { formatDistance, quote, recordBooking } from '@/lib/mesh';
import { findMeshListing } from '@/mock/mesh';

const DAY_OPTIONS = [1, 2, 3, 7];

export default function MeshListingPage() {
  const params = useParams();
  const id = Array.isArray(params.listingId) ? params.listingId[0]! : (params.listingId as string);
  const listing = useMemo(() => findMeshListing(id), [id]);

  const [days, setDays] = useState(2);
  const [booked, setBooked] = useState(false);

  const q = useMemo(
    () => (listing ? quote(listing.dailyRate, listing.deposit, listing.newPrice, days) : null),
    [listing, days],
  );

  if (!listing || !q) {
    return (
      <PageShell eyebrow="Amazon Mesh" title="Listing not found">
        <Card>
          <p className="text-sm text-muted-foreground">This item is no longer available to borrow.</p>
          <Link href="/app/mesh" className="mt-4 inline-flex text-sm font-medium text-brand">
            ← Back to Mesh
          </Link>
        </Card>
      </PageShell>
    );
  }

  function book() {
    recordBooking({
      role: 'borrow',
      title: listing!.title,
      imageUrl: listing!.imageUrl,
      counterpartyName: listing!.lenderName,
      days,
      dailyRate: listing!.dailyRate,
      total: q!.total,
      deposit: listing!.deposit,
      platformFee: q!.platformFee,
      lenderNet: q!.lenderNet,
    });
    setBooked(true);
  }

  return (
    <PageShell eyebrow={`Mesh · ${formatDistance(listing.distanceM)} away`} title={listing.title}>
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        {/* Left: photo + lender */}
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[4/3] bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={listing.imageUrl} alt={listing.title} className="h-full w-full object-cover" />
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-brand/15 font-mono text-xs font-semibold text-brand">
                {listing.lenderInitials}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{listing.lenderName}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  ★ {listing.rating.toFixed(1)} · lent {listing.lentCount}× on Mesh
                </p>
              </div>
              <span className="ml-auto">
                <Badge tone="accent">{listing.availability}</Badge>
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{listing.blurb}</p>
          </Card>
        </div>

        {/* Right: rent panel */}
        <div className="space-y-5">
          <div>
            <p className="text-4xl font-semibold tabular-nums text-brand">
              {formatMoney(listing.dailyRate)}
              <span className="text-base font-normal text-muted-foreground">/day</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="line-through">{formatMoney(listing.newPrice)}</span> to buy new
            </p>
          </div>

          {/* Days selector */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              How many days?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAY_OPTIONS.map((d) => {
                const active = d === days;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDays(d);
                      setBooked(false);
                    }}
                    className={`h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold tabular-nums transition ${
                      active
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-border text-foreground hover:border-brand/60'
                    }`}
                  >
                    {d}d
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quote breakdown */}
          <Card className="space-y-2.5">
            <Row label={`${formatMoney(listing.dailyRate)} × ${days} days`} value={formatMoney(q.total)} />
            <Row label="Refundable deposit" value={formatMoney(q.deposit)} muted />
            <Row label="Held by Amazon · buyer protection" value="Included" muted />
            <div className="my-1 border-t border-border/50" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">You pay now</span>
              <span className="text-xl font-semibold tabular-nums text-brand">{formatMoney(q.total)}</span>
            </div>
            <div className="rounded-lg bg-brand/10 p-3 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                {q.savedPct}% cheaper than buying new
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                You save {formatMoney(q.savedVsNew)} — and nothing new gets manufactured.
              </p>
            </div>
          </Card>

          {booked ? (
            <Card className="ring-brand/40">
              <div className="flex items-center gap-3">
                <span className="grid size-9 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-sm text-brand">
                  ✓
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Request sent</p>
                  <p className="text-sm text-foreground">
                    {listing.lenderName} will confirm — Amazon brokers the handoff {formatDistance(listing.distanceM)}{' '}
                    away and holds your deposit. See it in Rewards.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Button variant="primary" className="w-full" onClick={book}>
              Request to borrow · {formatMoney(q.total)}
            </Button>
          )}
          <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Simulated booking · demo
          </p>
        </div>
      </div>

      <div className="mt-8">
        <Link href="/app/mesh" className="text-sm font-medium text-brand">
          ← Back to Mesh
        </Link>
      </div>
    </PageShell>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</span>
      <span className={`tabular-nums ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
