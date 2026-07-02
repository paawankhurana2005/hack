'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  EXCHANGE_ITEMS,
  computeCurrentPrice,
  rescueProgress,
  hoursRemaining,
  getLocalRoutingListings,
  type ExchangeItem,
} from '@/lib/mocks/exchange-store';
import { getReturnById } from '@/lib/mocks/return-store';
import { getPricing } from '@/lib/api-client';

function formatINR(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

// Context passed via URL search param so detail page can share offset
function useOffsetHours() {
  const [offsetHours, setOffsetHours] = useState(0);
  const [ticking, setTicking] = useState(false);

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setOffsetHours((h) => h + 1), 800);
    return () => clearInterval(id);
  }, [ticking]);

  const reset = useCallback(() => {
    setOffsetHours(0);
    setTicking(false);
  }, []);

  return { offsetHours, setOffsetHours, ticking, setTicking, reset };
}

// ─── Timer ring ───────────────────────────────────────────────────────────────
function TimerRing({ progress, hours }: { progress: number; hours: number }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const remaining = 1 - progress;
  const urgent = progress > 0.75;
  const warning = progress > 0.5;
  const color = urgent ? '#f97316' : warning ? '#FF9900' : '#10b981';

  return (
    <div className="relative flex items-center justify-center">
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-secondary" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - remaining)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-sm font-bold tabular-nums leading-none" style={{ color }}>
          {hours < 1 ? `${Math.round(hours * 60)}m` : `${hours.toFixed(0)}h`}
        </p>
        <p className="text-[9px] text-muted-foreground">left</p>
      </div>
    </div>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────
const GRADE_COLOR: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-500/20 text-emerald-400',
  B: 'bg-brand/20 text-brand',
  C: 'bg-orange-500/20 text-orange-400',
};

const STATUS_LABEL: Record<ExchangeItem['status'], string> = {
  live: 'Live',
  matched: 'Buyer matched',
  deal_pending: 'Deal pending',
};

function ItemCard({
  item,
  offsetHours,
  enginePriceRupees,
}: {
  item: ExchangeItem;
  offsetHours: number;
  enginePriceRupees?: number;
}) {
  // Prefer the live engine price; fall back to the local estimate if the API/
  // record isn't available for this item.
  const price =
    enginePriceRupees != null ? Math.round(enginePriceRupees * 100) : computeCurrentPrice(item, offsetHours);
  const progress = rescueProgress(item, offsetHours);
  const hrs = hoursRemaining(item, offsetHours);
  const urgent = progress > 0.75;
  const respondedCount = item.matchedBuyers.filter((b) => b.responded).length;
  const discountFromOriginal = ((item.originalPriceCents - price) / item.originalPriceCents) * 100;

  return (
    <Link
      href={`/seller/rescue/${item.returnId}`}
      className="group flex flex-col rounded-2xl bg-card ring-1 ring-border transition-all hover:ring-brand/50 hover:shadow-lg hover:shadow-brand/5 overflow-hidden"
    >
      {/* Product image */}
      <div className="relative h-44 w-full bg-secondary">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.productName}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-muted-foreground/30">
            📦
          </div>
        )}
        {/* Overlaid badges */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm ${GRADE_COLOR[item.grade]}`}>
            Grade {item.grade}
          </span>
          {item.source === 'local_routing' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
              <span className="size-1 rounded-full bg-white animate-pulse" />
              From return
            </span>
          )}
        </div>
        {/* Timer ring top-right */}
        <div className="absolute right-3 top-3">
          <TimerRing progress={progress} hours={hrs} />
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 p-4">
        <p className="text-sm font-semibold text-foreground leading-snug">{item.productName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.category}</p>

        {/* Price */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Current ask</p>
          <p className={`mt-0.5 text-2xl font-bold tabular-nums ${urgent ? 'text-orange-400' : 'text-foreground'}`}>
            {formatINR(price)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="line-through">{formatINR(item.originalPriceCents)}</span>
            <span className="ml-2 text-brand">{discountFromOriginal.toFixed(0)}% off retail</span>
          </p>
        </div>
      </div>

      {/* Footer chips */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-brand" />
          {item.matchedBuyers.length} buyers nearby
        </span>
        {respondedCount > 0 && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-400">
            {respondedCount} responded
          </span>
        )}
        <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-semibold ${
          item.status === 'live' ? 'bg-emerald-500/15 text-emerald-400' :
          item.status === 'matched' ? 'bg-brand/15 text-brand' :
          'bg-warning/15 text-warning'
        }`}>
          {STATUS_LABEL[item.status]}
        </span>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RescuePage() {
  const { offsetHours, setOffsetHours, ticking, setTicking, reset } = useOffsetHours();
  const [items, setItems] = useState<ExchangeItem[]>(EXCHANGE_ITEMS);
  const [enginePrices, setEnginePrices] = useState<Record<string, number>>({});

  // Fetch the live engine price for every card. Best-effort per item — any that
  // lack a priced record just fall back to the local estimate.
  useEffect(() => {
    let active = true;
    Promise.all(
      items.map(async (it) => {
        try {
          const b = await getPricing(it.returnId);
          return [it.returnId, b.finalPrice] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      if (!active) return;
      const map: Record<string, number> = {};
      for (const p of pairs) if (p) map[p[0]] = p[1];
      setEnginePrices(map);
    });
    return () => { active = false; };
  }, [items]);

  useEffect(() => {
    const local = getLocalRoutingListings();
    if (local.length === 0) return;
    // Backfill imageUrl from the return store for any listing created before imageUrl support
    const enriched = local.map((item) => {
      if (item.imageUrl) return item;
      const ret = getReturnById(item.returnId);
      const photo = ret?.photoUrls?.[0];
      return photo ? { ...item, imageUrl: photo } : item;
    });
    const localIds = new Set(enriched.map((l) => l.returnId));
    setItems([...enriched, ...EXCHANGE_ITEMS.filter((i) => !localIds.has(i.returnId))]);
  }, []);

  const totalBuyers = items.reduce((s, i) => s + i.matchedBuyers.length, 0);
  const responded = items.flatMap((i) => i.matchedBuyers.filter((b) => b.responded)).length;

  return (
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Rescue
      </span>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Rescue pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Returned items matched to local buyers before they move an inch.
          </p>
        </div>

        {/* Demo clock controls */}
        <div className="flex items-center gap-2">
          {offsetHours > 0 && (
            <span className="font-mono text-xs text-brand">+{offsetHours.toFixed(0)}h</span>
          )}
          <button
            type="button"
            onClick={() => setOffsetHours((h) => h + 6)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-brand hover:text-brand transition-colors"
          >
            +6h
          </button>
          <button
            type="button"
            onClick={() => setTicking((t) => !t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              ticking ? 'bg-warning/20 text-warning' : 'bg-brand text-brand-foreground hover:bg-brand/90'
            }`}
          >
            {ticking ? 'Pause' : 'Animate'}
          </button>
          {offsetHours > 0 && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-6 flex gap-4">
        {[
          { value: items.length, label: 'Active items' },
          { value: totalBuyers, label: 'Buyers notified' },
          { value: responded, label: 'Responses received' },
          { value: '0', label: 'Warehouse trips made' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-card px-5 py-3 ring-1 ring-border">
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Item grid */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {items.map((item) => (
          <ItemCard
            key={item.returnId}
            item={item}
            offsetHours={offsetHours}
            enginePriceRupees={enginePrices[item.returnId]}
          />
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Click any item to see pricing breakdown and matched buyers.
      </p>
    </div>
  );
}
