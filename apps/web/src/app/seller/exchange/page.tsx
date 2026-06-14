'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  EXCHANGE_ITEMS,
  computeCurrentPrice,
  rescueProgress,
  hoursRemaining,
  type ExchangeItem,
  type MatchedBuyer,
} from '@/lib/mocks/exchange-store';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function pct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

function minutesAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const GRADE_STYLE: Record<'A' | 'B' | 'C', { cls: string; label: string }> = {
  A: { cls: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', label: 'Grade A' },
  B: { cls: 'bg-brand/20 text-brand border border-brand/30', label: 'Grade B' },
  C: { cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30', label: 'Grade C' },
};

const STATUS_STYLE: Record<ExchangeItem['status'], { label: string; cls: string }> = {
  live: { label: 'Live', cls: 'bg-emerald-500/20 text-emerald-400' },
  matched: { label: 'Buyer matched', cls: 'bg-brand/20 text-brand' },
  deal_pending: { label: 'Deal pending', cls: 'bg-warning/20 text-warning' },
};

const MATCH_REASON: Record<MatchedBuyer['matchReason'], string> = {
  searched: 'Searched this category',
  wishlisted: 'Wishlisted this item',
  purchased_similar: 'Bought similar product',
};

// ─── Progress bar ─────────────────────────────────────────────────────────────
function RescueBar({ progress, urgency }: { progress: number; urgency: boolean }) {
  const fill = urgency ? 'bg-warning' : progress > 0.5 ? 'bg-brand' : 'bg-emerald-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full rounded-full transition-all duration-700 ${fill}`}
        style={{ width: `${(1 - progress) * 100}%` }}
      />
    </div>
  );
}

// ─── Buyer row ────────────────────────────────────────────────────────────────
function BuyerRow({ buyer }: { buyer: MatchedBuyer }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/20 font-mono text-xs font-bold text-brand">
        {buyer.avatar}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{buyer.name}</p>
        <p className="text-xs text-muted-foreground">{MATCH_REASON[buyer.matchReason]}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-foreground">{buyer.distanceKm} km</p>
        <p className="text-xs text-muted-foreground">away</p>
      </div>
      <div className="shrink-0 w-20 text-right">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            buyer.responded
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          {buyer.responded ? 'Responded' : 'Notified'}
        </span>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{minutesAgo(buyer.notifiedAt)}</p>
      </div>
      <div className="shrink-0 w-14 text-right">
        <p className="text-xs font-mono text-brand">{pct(buyer.matchScore)}</p>
        <p className="text-[10px] text-muted-foreground">match</p>
      </div>
    </div>
  );
}

// ─── Exchange item card ────────────────────────────────────────────────────────
function ExchangeCard({
  item,
  offsetHours,
  selected,
  onSelect,
}: {
  item: ExchangeItem;
  offsetHours: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const currentPrice = computeCurrentPrice(item, offsetHours);
  const progress = rescueProgress(item, offsetHours);
  const hrs = hoursRemaining(item, offsetHours);
  const urgency = progress > 0.75;

  const discountFromBase =
    ((item.basePriceCents - currentPrice) / item.basePriceCents) * 100;
  const discountFromOriginal =
    ((item.originalPriceCents - currentPrice) / item.originalPriceCents) * 100;

  const respondedCount = item.matchedBuyers.filter((b) => b.responded).length;
  const grade = GRADE_STYLE[item.grade];
  const status = STATUS_STYLE[item.status];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-5 text-left transition-all ${
        selected
          ? 'border-brand bg-card shadow-lg shadow-brand/10'
          : 'border-border bg-card hover:border-brand/40 hover:bg-card/80'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground leading-tight">{item.productName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.returnId}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${grade.cls}`}>
            {grade.label}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${status.cls}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Live price */}
      <div className="mt-4 flex items-end gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Live price
          </p>
          <p className={`text-2xl font-bold tabular-nums ${urgency ? 'text-warning' : 'text-foreground'}`}>
            {formatINR(currentPrice)}
          </p>
        </div>
        <div className="mb-1 text-right">
          <p className="text-xs text-muted-foreground line-through">{formatINR(item.originalPriceCents)}</p>
          <p className="text-xs font-semibold text-brand">
            {discountFromOriginal.toFixed(0)}% off retail
          </p>
        </div>
      </div>

      {/* Rescue timer */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className={urgency ? 'text-warning font-semibold' : 'text-muted-foreground'}>
            {urgency ? '⚠ Rescue window closing' : 'Rescue window'}
          </span>
          <span className={`font-mono font-semibold ${urgency ? 'text-warning' : 'text-foreground'}`}>
            {hrs.toFixed(1)}h left
          </span>
        </div>
        <RescueBar progress={progress} urgency={urgency} />
      </div>

      {/* Factors row */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary/60 px-2 py-2">
          <p className="text-xs font-semibold text-foreground">{item.matchedBuyers.length}</p>
          <p className="text-[10px] text-muted-foreground">buyers matched</p>
        </div>
        <div className="rounded-lg bg-secondary/60 px-2 py-2">
          <p className="text-xs font-semibold text-foreground">{respondedCount}</p>
          <p className="text-[10px] text-muted-foreground">responded</p>
        </div>
        <div className="rounded-lg bg-secondary/60 px-2 py-2">
          <p className="text-xs font-semibold text-foreground">{item.similarListingsNearby}</p>
          <p className="text-[10px] text-muted-foreground">competing listings</p>
        </div>
      </div>

      {/* Price decay note */}
      {discountFromBase > 1 && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Price has dropped {discountFromBase.toFixed(0)}% from opening ask of{' '}
          {formatINR(item.basePriceCents)} due to time decay + {item.similarListingsNearby}{' '}
          competing listings.
        </p>
      )}
    </button>
  );
}

// ─── Buyer match panel ────────────────────────────────────────────────────────
function BuyerMatchPanel({
  item,
  offsetHours,
}: {
  item: ExchangeItem;
  offsetHours: number;
}) {
  const currentPrice = computeCurrentPrice(item, offsetHours);
  const sortedBuyers = [...item.matchedBuyers].sort((a, b) => b.matchScore - a.matchScore);

  return (
    <div className="rounded-2xl bg-card ring-1 ring-border overflow-hidden">
      {/* Panel header */}
      <div className="border-b border-border bg-secondary/40 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Hyperlocal buyer match
        </p>
        <h3 className="mt-1 text-base font-semibold text-foreground">{item.productName}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.matchedBuyers.length} buyers within {item.radiusKm}km radius —
          notified proactively before return was processed
        </p>
      </div>

      {/* Radius + price summary */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
        <div className="px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Search radius
          </p>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-xl font-bold text-foreground">{item.radiusKm} km</p>
            <p className="mb-0.5 text-xs text-muted-foreground">configurable</p>
          </div>
          {/* Concentric rings visualisation */}
          <div className="mt-3 flex items-center gap-2">
            {[5, 10, 15].map((r) => (
              <div key={r} className="flex items-center gap-1">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    r <= item.radiusKm ? 'bg-brand' : 'bg-secondary'
                  }`}
                />
                <span className="text-[10px] text-muted-foreground">{r}km</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Current ask
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">{formatINR(currentPrice)}</p>
          <p className="text-xs text-muted-foreground">
            vs ₹1,240 warehouse round-trip cost
          </p>
        </div>
      </div>

      {/* Warehouse avoidance banner */}
      <div className="mx-5 mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/20">
        <p className="text-xs font-semibold text-emerald-400">
          600 km warehouse trip eliminated
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          By matching a local buyer before the return is processed, this item never
          enters the return logistics chain.
        </p>
      </div>

      {/* Buyer list */}
      <div className="px-5 pb-5 pt-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Matched buyers — sorted by fit score
        </p>
        <div className="flex flex-col gap-2">
          {sortedBuyers.map((buyer) => (
            <BuyerRow key={buyer.buyerId} buyer={buyer} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Pricing engine explainer ─────────────────────────────────────────────────
function PricingEngineCard({
  item,
  offsetHours,
}: {
  item: ExchangeItem;
  offsetHours: number;
}) {
  const progress = rescueProgress(item, offsetHours);
  const competitionFactor = Math.min(item.similarListingsNearby / 20, 1);
  const decayPct = progress * 0.4 + competitionFactor * 0.2 * progress;
  const currentPrice = computeCurrentPrice(item, offsetHours);

  const factors = [
    {
      label: 'Condition grade',
      value: item.grade,
      detail: `Grade ${item.grade} → ${{ A: 72, B: 54, C: 38 }[item.grade]}% of retail`,
      weight: 'primary',
    },
    {
      label: 'Rescue window elapsed',
      value: `${(progress * 100).toFixed(0)}%`,
      detail: `Time decay contribution: −${(progress * 40).toFixed(0)}% off base`,
      weight: progress > 0.75 ? 'high' : 'medium',
    },
    {
      label: 'Competing listings nearby',
      value: String(item.similarListingsNearby),
      detail: `Competition factor: −${(competitionFactor * progress * 20).toFixed(0)}% off base`,
      weight: item.similarListingsNearby > 8 ? 'high' : 'low',
    },
    {
      label: 'Total decay applied',
      value: `−${(decayPct * 100).toFixed(0)}%`,
      detail: `Opening ask ${formatINR(item.basePriceCents)} → live price ${formatINR(currentPrice)}`,
      weight: 'neutral',
    },
  ];

  const weightCls: Record<string, string> = {
    primary: 'text-brand',
    high: 'text-warning',
    medium: 'text-foreground',
    low: 'text-muted-foreground',
    neutral: 'text-foreground',
  };

  return (
    <div className="rounded-2xl bg-card ring-1 ring-border">
      <div className="border-b border-border px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Pricing engine — glass box
        </p>
        <h3 className="mt-1 text-sm font-semibold text-foreground">
          How this price was computed
        </h3>
      </div>
      <div className="divide-y divide-border">
        {factors.map((f) => (
          <div key={f.label} className="flex items-start justify-between gap-4 px-5 py-3">
            <div>
              <p className="text-sm text-foreground">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.detail}</p>
            </div>
            <span className={`shrink-0 font-mono text-sm font-bold ${weightCls[f.weight]}`}>
              {f.value}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-brand/20 bg-brand/5 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          Price floor: {formatINR(item.floorPriceCents)} — guaranteed minimum before item is
          diverted to donate / recycle.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ExchangePage() {
  const [selectedId, setSelectedId] = useState<string>(EXCHANGE_ITEMS[0]!.returnId);
  const [offsetHours, setOffsetHours] = useState(0);
  const [ticking, setTicking] = useState(false);

  const selectedItem = (EXCHANGE_ITEMS.find((i) => i.returnId === selectedId) ?? EXCHANGE_ITEMS[0])!;

  // Simulate time ticking
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setOffsetHours((h) => h + 1), 800);
    return () => clearInterval(id);
  }, [ticking]);

  const reset = useCallback(() => {
    setOffsetHours(0);
    setTicking(false);
  }, []);

  // Aggregate stats
  const totalBuyers = EXCHANGE_ITEMS.reduce((s, i) => s + i.matchedBuyers.length, 0);
  const avgDistance =
    EXCHANGE_ITEMS.flatMap((i) => i.matchedBuyers.map((b) => b.distanceKm)).reduce(
      (s, d, _, arr) => s + d / arr.length,
      0
    );
  const respondedTotal = EXCHANGE_ITEMS.flatMap((i) =>
    i.matchedBuyers.filter((b) => b.responded)
  ).length;

  return (
    <div>
      {/* Page header */}
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Exchange
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Exchange engine
      </h1>
      <p className="mt-2 text-muted-foreground">
        Dynamic pricing + hyperlocal buyer matching — returned items sold locally before they
        move an inch.
      </p>

      {/* Demo controls */}
      <div className="mt-5 flex items-center gap-3 rounded-xl bg-secondary/60 px-4 py-3 ring-1 ring-border">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Demo
        </span>
        <span className="text-xs text-muted-foreground">
          Simulate the rescue clock — watch prices decay in real time as windows close.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {offsetHours > 0 && (
            <span className="font-mono text-xs text-brand">+{offsetHours.toFixed(0)}h simulated</span>
          )}
          <button
            type="button"
            onClick={() => setTicking((t) => !t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              ticking
                ? 'bg-warning/20 text-warning hover:bg-warning/30'
                : 'bg-brand text-brand-foreground hover:bg-brand/90'
            }`}
          >
            {ticking ? 'Pause clock' : 'Run rescue clock'}
          </button>
          <button
            type="button"
            onClick={() => setOffsetHours((h) => h + 6)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-brand hover:text-brand"
          >
            +6 hours
          </button>
          {offsetHours > 0 && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-5 grid grid-cols-4 gap-3">
        {[
          { label: 'Active listings', value: EXCHANGE_ITEMS.length, unit: 'items' },
          { label: 'Buyers notified', value: totalBuyers, unit: 'people' },
          { label: 'Avg match distance', value: `${avgDistance.toFixed(1)} km`, unit: 'radius' },
          { label: 'Responses received', value: respondedTotal, unit: 'buyers' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-card px-4 py-3 ring-1 ring-border">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.unit}</p>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="mt-6 grid grid-cols-5 gap-5">
        {/* Item cards column */}
        <div className="col-span-2 flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Exchange pipeline ({EXCHANGE_ITEMS.length} items)
          </p>
          {EXCHANGE_ITEMS.map((item) => (
            <ExchangeCard
              key={item.returnId}
              item={item}
              offsetHours={offsetHours}
              selected={selectedId === item.returnId}
              onSelect={() => setSelectedId(item.returnId)}
            />
          ))}
        </div>

        {/* Detail column */}
        <div className="col-span-3 flex flex-col gap-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Selected item detail
          </p>
          <BuyerMatchPanel item={selectedItem} offsetHours={offsetHours} />
          <PricingEngineCard item={selectedItem} offsetHours={offsetHours} />
        </div>
      </div>
    </div>
  );
}
