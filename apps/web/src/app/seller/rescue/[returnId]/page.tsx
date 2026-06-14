'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  EXCHANGE_ITEMS,
  computeCurrentPrice,
  rescueProgress,
  hoursRemaining,
  getLocalRoutingListings,
  type ExchangeItem,
  type MatchedBuyer,
} from '@/lib/mocks/exchange-store';

function formatINR(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function minutesAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const GRADE_COLOR: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-500/20 text-emerald-400',
  B: 'bg-brand/20 text-brand',
  C: 'bg-orange-500/20 text-orange-400',
};

const MATCH_REASON: Record<MatchedBuyer['matchReason'], string> = {
  searched: 'Searched this category',
  wishlisted: 'Wishlisted this item',
  purchased_similar: 'Bought similar before',
};

// ─── Pricing tab ──────────────────────────────────────────────────────────────
function PricingTab({ item, offsetHours }: { item: ExchangeItem; offsetHours: number }) {
  const currentPrice = computeCurrentPrice(item, offsetHours);
  const progress = rescueProgress(item, offsetHours);
  const hrs = hoursRemaining(item, offsetHours);
  const competitionFactor = Math.min(item.similarListingsNearby / 20, 1);
  const timeDecayPct = progress * 40;
  const compDecayPct = competitionFactor * progress * 20;
  const totalDecayPct = timeDecayPct + compDecayPct;
  const urgent = progress > 0.75;

  const factors = [
    {
      icon: '◈',
      label: 'Condition grade',
      sub: `Grade ${item.grade} item`,
      value: `${({ A: 72, B: 54, C: 38 }[item.grade])}% of retail`,
      color: 'text-emerald-400',
    },
    {
      icon: '◷',
      label: 'Time remaining',
      sub: `${hrs.toFixed(1)}h of ${item.rescueWindowHours}h window left`,
      value: `−${timeDecayPct.toFixed(0)}% decay`,
      color: urgent ? 'text-orange-400' : 'text-brand',
    },
    {
      icon: '◎',
      label: 'Nearby competition',
      sub: `${item.similarListingsNearby} similar listings in area`,
      value: `−${compDecayPct.toFixed(0)}% pressure`,
      color: item.similarListingsNearby > 8 ? 'text-orange-400' : 'text-muted-foreground',
    },
  ];

  return (
    <div className="mt-6 space-y-6">
      {/* Price arrow */}
      <div className="flex items-center gap-4 rounded-2xl bg-card p-6 ring-1 ring-border">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Opening ask</p>
          <p className="mt-1 text-2xl font-bold text-muted-foreground tabular-nums">{formatINR(item.basePriceCents)}</p>
        </div>
        <div className="flex-1 flex items-center">
          <div className="h-px flex-1 bg-gradient-to-r from-muted-foreground/30 to-brand/60" />
          <div className="mx-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
            −{totalDecayPct.toFixed(0)}% applied
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-brand/60 to-transparent" />
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Live price</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${urgent ? 'text-orange-400' : 'text-foreground'}`}>
            {formatINR(currentPrice)}
          </p>
        </div>
      </div>

      {/* Factor cards */}
      <div className="grid grid-cols-3 gap-3">
        {factors.map((f) => (
          <div key={f.label} className="rounded-2xl bg-card p-4 ring-1 ring-border">
            <span className={`text-xl ${f.color}`}>{f.icon}</span>
            <p className="mt-3 text-sm font-semibold text-foreground">{f.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{f.sub}</p>
            <p className={`mt-3 text-sm font-bold tabular-nums ${f.color}`}>{f.value}</p>
          </div>
        ))}
      </div>

      {/* Floor note */}
      <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm">
        <span className="text-muted-foreground">Price floor</span>
        <span className="font-semibold text-foreground">{formatINR(item.floorPriceCents)}</span>
        <span className="text-muted-foreground">— below this, item routes to donate / recycle automatically.</span>
      </div>
    </div>
  );
}

// ─── Buyers tab ───────────────────────────────────────────────────────────────
function BuyersTab({ item, offsetHours }: { item: ExchangeItem; offsetHours: number }) {
  const currentPrice = computeCurrentPrice(item, offsetHours);
  const sortedBuyers = [...item.matchedBuyers].sort((a, b) => b.matchScore - a.matchScore);

  return (
    <div className="mt-6 space-y-4">
      {/* Summary chips */}
      <div className="flex gap-3">
        <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 ring-1 ring-border text-sm">
          <span className="size-2 rounded-full bg-brand" />
          <span className="font-semibold text-foreground">{item.matchedBuyers.length} buyers</span>
          <span className="text-muted-foreground">within {item.radiusKm}km</span>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 ring-1 ring-emerald-500/20 text-sm">
          <span className="text-emerald-400 font-semibold">600km warehouse trip eliminated</span>
        </div>
      </div>

      {/* Current price context */}
      <p className="text-sm text-muted-foreground">
        All buyers below have been proactively notified about this item at{' '}
        <span className="font-semibold text-foreground">{formatINR(currentPrice)}</span> —{' '}
        before the return was even processed.
      </p>

      {/* Buyer cards */}
      <div className="space-y-2">
        {sortedBuyers.map((buyer, i) => (
          <div
            key={buyer.buyerId}
            className="flex items-center gap-4 rounded-2xl bg-card p-4 ring-1 ring-border"
          >
            {/* Rank */}
            <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>

            {/* Avatar */}
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/15 font-mono text-xs font-bold text-brand">
              {buyer.avatar}
            </div>

            {/* Name + reason */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{buyer.name}</p>
              <p className="text-xs text-muted-foreground">{MATCH_REASON[buyer.matchReason]}</p>
            </div>

            {/* Distance */}
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{buyer.distanceKm} km</p>
              <p className="text-xs text-muted-foreground">away</p>
            </div>

            {/* Notified */}
            <div className="text-right w-24">
              <span className={`text-xs font-semibold ${buyer.responded ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                {buyer.responded ? '✓ Responded' : 'Notified'}
              </span>
              <p className="text-[10px] text-muted-foreground">{minutesAgo(buyer.notifiedAt)}</p>
            </div>

            {/* Match score */}
            <div className="text-right w-14">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${buyer.matchScore * 100}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] font-mono text-brand">{Math.round(buyer.matchScore * 100)}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RescueDetailPage() {
  const { returnId } = useParams<{ returnId: string }>();
  const [tab, setTab] = useState<'pricing' | 'buyers'>('pricing');
  const [offsetHours, setOffsetHours] = useState(0);
  const [ticking, setTicking] = useState(false);

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setOffsetHours((h) => h + 1), 800);
    return () => clearInterval(id);
  }, [ticking]);

  const item =
    EXCHANGE_ITEMS.find((i) => i.returnId === returnId) ??
    getLocalRoutingListings().find((i) => i.returnId === returnId);
  if (!item) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Item not found.{' '}
        <Link href="/seller/rescue" className="text-brand hover:underline">
          Back to Rescue
        </Link>
      </div>
    );
  }

  const currentPrice = computeCurrentPrice(item, offsetHours);
  const progress = rescueProgress(item, offsetHours);
  const hrs = hoursRemaining(item, offsetHours);
  const urgent = progress > 0.75;

  return (
    <div>
      {/* Back + breadcrumb */}
      <Link
        href="/seller/rescue"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back to Rescue pipeline
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${GRADE_COLOR[item.grade]}`}>
              Grade {item.grade}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{item.returnId}</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {item.productName}
          </h1>
        </div>

        {/* Live price + timer */}
        <div className="flex items-center gap-4 rounded-2xl bg-card px-5 py-3 ring-1 ring-border">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Live price</p>
            <p className={`text-xl font-bold tabular-nums ${urgent ? 'text-orange-400' : 'text-foreground'}`}>
              {formatINR(currentPrice)}
            </p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Time left</p>
            <p className={`text-xl font-bold tabular-nums ${urgent ? 'text-orange-400' : 'text-foreground'}`}>
              {hrs.toFixed(1)}h
            </p>
          </div>
          {/* Demo controls */}
          <div className="flex items-center gap-2 border-l border-border pl-4">
            {offsetHours > 0 && (
              <span className="text-[10px] font-mono text-brand">+{offsetHours.toFixed(0)}h</span>
            )}
            <button
              type="button"
              onClick={() => setOffsetHours((h) => h + 6)}
              className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-brand hover:text-brand transition-colors"
            >
              +6h
            </button>
            <button
              type="button"
              onClick={() => setTicking((t) => !t)}
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                ticking ? 'bg-warning/20 text-warning' : 'bg-brand/20 text-brand hover:bg-brand/30'
              }`}
            >
              {ticking ? 'Pause' : 'Animate'}
            </button>
            {offsetHours > 0 && (
              <button
                type="button"
                onClick={() => { setOffsetHours(0); setTicking(false); }}
                className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-xl bg-secondary p-1 w-fit">
        {(['pricing', 'buyers'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'pricing' ? 'Pricing engine' : `Buyers (${item.matchedBuyers.length})`}
          </button>
        ))}
      </div>

      {tab === 'pricing' ? (
        <PricingTab item={item} offsetHours={offsetHours} />
      ) : (
        <BuyersTab item={item} offsetHours={offsetHours} />
      )}
    </div>
  );
}
