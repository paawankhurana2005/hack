'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getLocalRoutingListings, type ExchangeItem, type MatchedBuyer } from '@/lib/mocks/exchange-store';

function minutesAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

const GRADE_COLOR: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-500/20 text-emerald-400',
  B: 'bg-brand/20 text-brand',
  C: 'bg-orange-500/20 text-orange-400',
};

function accountTier(score: number) {
  if (score >= 0.85) return { label: 'Prime', cls: 'text-brand bg-brand/10' };
  if (score >= 0.70) return { label: 'Verified', cls: 'text-emerald-400 bg-emerald-500/10' };
  return { label: 'Standard', cls: 'text-muted-foreground bg-secondary' };
}

function formatTenure(days?: number): string {
  if (!days) return '—';
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.floor(days / 365)}yr`;
}

const SIGNAL_LABEL: Record<MatchedBuyer['matchReason'], string> = {
  searched: 'Active search',
  wishlisted: 'Wishlisted',
  purchased_similar: 'Prior purchase',
};

export default function ListingDetailPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const [item, setItem] = useState<ExchangeItem | null | 'loading'>('loading');

  useEffect(() => {
    const found = getLocalRoutingListings().find((i) => i.returnId === listingId);
    setItem(found ?? null);
  }, [listingId]);

  if (item === 'loading') {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-5 w-40 rounded-lg bg-secondary" />
        <div className="h-10 w-72 rounded-lg bg-secondary" />
        <div className="h-48 w-full rounded-2xl bg-secondary" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Listing not found.{' '}
        <Link href="/seller/listings" className="text-brand hover:underline">
          Back to Listings
        </Link>
      </div>
    );
  }

  const sorted = [...item.matchedBuyers].sort((a, b) => b.matchScore - a.matchScore);
  const topBuyer = sorted[0];
  const otherBuyers = sorted.slice(1);
  const respondedCount = item.matchedBuyers.filter((b) => b.responded).length;

  return (
    <div>
      {/* Back */}
      <Link
        href="/seller/listings"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back to Listings
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${GRADE_COLOR[item.grade]}`}>
              Grade {item.grade}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-400">
              <span className="size-1 rounded-full bg-emerald-400 animate-pulse" />
              Local Routing
            </span>
            <span className="font-mono text-xs text-muted-foreground">{item.returnId}</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {item.productName}
          </h1>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Routing active status */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="size-3 rounded-full bg-emerald-400" />
              <div className="absolute inset-0 size-3 animate-ping rounded-full bg-emerald-500/60" />
            </div>
            <p className="font-semibold text-emerald-400">Routing Active — Buyer has been matched</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Amazon matched this item to a local buyer. No warehouse trip needed — item stays in the neighbourhood.
          </p>
          <div className="mt-4 flex gap-3 flex-wrap">
            <div className="rounded-lg bg-card px-4 py-2.5 ring-1 ring-border text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Search radius</p>
              <p className="mt-0.5 text-lg font-bold text-foreground">{item.radiusKm} km</p>
            </div>
            <div className="rounded-lg bg-card px-4 py-2.5 ring-1 ring-border text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Buyers notified</p>
              <p className="mt-0.5 text-lg font-bold text-foreground">{item.matchedBuyers.length}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 px-4 py-2.5 ring-1 ring-emerald-500/20 text-center">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wide">Responded</p>
              <p className="mt-0.5 text-lg font-bold text-emerald-400">{respondedCount}</p>
            </div>
          </div>
        </div>

        {/* Top matched buyer */}
        {topBuyer && (
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Matched Buyer
            </p>
            <div className="rounded-2xl bg-card p-5 ring-1 ring-emerald-500/30">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-base font-bold text-foreground">{topBuyer.buyerId}</span>
                    {(() => {
                      const tier = accountTier(topBuyer.matchScore);
                      return (
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${tier.cls}`}>
                          {tier.label}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {topBuyer.city ?? 'Local area'} · {topBuyer.distanceKm} km away
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    {topBuyer.accountAgeDays !== undefined && (
                      <span>Member {formatTenure(topBuyer.accountAgeDays)}</span>
                    )}
                    {topBuyer.totalOrders !== undefined && (
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground/50">·</span>
                        {topBuyer.totalOrders.toLocaleString()} orders
                      </span>
                    )}
                    {topBuyer.buyerRating !== undefined && (
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground/50">·</span>
                        <span className="text-yellow-400">★</span> {topBuyer.buyerRating.toFixed(1)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <span className="text-muted-foreground/50">·</span>
                      {SIGNAL_LABEL[topBuyer.matchReason]}
                    </span>
                  </div>
                </div>
                <div className="w-20 shrink-0 text-right">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${topBuyer.matchScore * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] font-mono text-emerald-400">
                    {Math.round(topBuyer.matchScore * 100)}% match
                  </p>
                </div>
              </div>
              {topBuyer.responded && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span className="text-sm font-semibold text-emerald-400">
                    Buyer has responded · {minutesAgo(topBuyer.notifiedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Other notified buyers */}
        {otherBuyers.length > 0 && (
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Also Notified ({otherBuyers.length} more)
            </p>
            <div className="space-y-2">
              {otherBuyers.map((buyer, i) => {
                const tier = accountTier(buyer.matchScore);
                return (
                  <div
                    key={buyer.buyerId}
                    className="flex items-start gap-4 rounded-xl bg-card p-3.5 ring-1 ring-border"
                  >
                    <span className="mt-0.5 w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 2}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-foreground">{buyer.buyerId}</span>
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${tier.cls}`}>
                          {tier.label}
                        </span>
                        <span className={`text-xs font-semibold ${buyer.responded ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          {buyer.responded ? '✓ Responded' : 'Notified'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {buyer.city ?? 'Local area'} · {buyer.distanceKm} km away
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {buyer.accountAgeDays !== undefined && <span>Member {formatTenure(buyer.accountAgeDays)}</span>}
                        {buyer.totalOrders !== undefined && (
                          <span className="flex items-center gap-1"><span className="text-muted-foreground/50">·</span>{buyer.totalOrders.toLocaleString()} orders</span>
                        )}
                        {buyer.buyerRating !== undefined && (
                          <span className="flex items-center gap-1"><span className="text-muted-foreground/50">·</span><span className="text-yellow-400">★</span>{buyer.buyerRating.toFixed(1)}</span>
                        )}
                        <span className="flex items-center gap-1"><span className="text-muted-foreground/50">·</span>{SIGNAL_LABEL[buyer.matchReason]}</span>
                      </div>
                    </div>
                    <div className="w-14 shrink-0 text-right">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${buyer.matchScore * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] font-mono text-brand">{Math.round(buyer.matchScore * 100)}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sustainability impact */}
        {(item.co2SavedKg !== undefined || item.distanceSavedKm !== undefined) && (
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Sustainability Impact
            </p>
            <div className="grid grid-cols-2 gap-3">
              {item.co2SavedKg !== undefined && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
                  <p className="text-3xl">🌿</p>
                  <p className="mt-3 text-4xl font-bold text-emerald-400">{item.co2SavedKg} kg</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-400">CO₂ avoided</p>
                  <p className="mt-1 text-xs text-muted-foreground">vs. warehouse round-trip</p>
                </div>
              )}
              {item.distanceSavedKm !== undefined && (
                <div className="rounded-2xl border border-brand/20 bg-brand/5 p-6 text-center">
                  <p className="text-3xl">📍</p>
                  <p className="mt-3 text-4xl font-bold text-brand">{item.distanceSavedKm} km</p>
                  <p className="mt-1 text-sm font-semibold text-brand">warehouse trip eliminated</p>
                  <p className="mt-1 text-xs text-muted-foreground">item never left the neighbourhood</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
