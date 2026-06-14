'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getLocalRoutingListings, type ExchangeItem } from '@/lib/mocks/exchange-store';

function formatINR(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

// ─── Mock regular listings ─────────────────────────────────────────────────────
interface RegularListing {
  listingId: string;
  asin: string;
  sku: string;
  productName: string;
  category: string;
  priceCents: number;
  stock: number;
  unitsSold: number;
  status: 'active' | 'inactive' | 'out_of_stock';
  createdAt: string;
  views: number;
}

const now = Date.now();

const REGULAR_LISTINGS: RegularListing[] = [
  {
    listingId: 'LST-001',
    asin: 'B09XYZ1234',
    sku: 'BOAT-AIR-141-BLK',
    productName: 'boAt Airdopes 141 — True Wireless Earbuds (Black)',
    category: 'Electronics',
    priceCents: 149900,
    stock: 24,
    unitsSold: 138,
    status: 'active',
    createdAt: new Date(now - 14 * 86400000).toISOString(),
    views: 3420,
  },
  {
    listingId: 'LST-002',
    asin: 'B0CXYZ5678',
    sku: 'IPOT-DUO-3L-SS',
    productName: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker (3L)',
    category: 'Kitchen & Home',
    priceCents: 699900,
    stock: 8,
    unitsSold: 45,
    status: 'active',
    createdAt: new Date(now - 30 * 86400000).toISOString(),
    views: 1870,
  },
  {
    listingId: 'LST-003',
    asin: 'B08ABC9012',
    sku: 'LEV-511-32x30-BLU',
    productName: "Levi's 511 Slim Fit Jeans — Mid-Wash Blue (32×30)",
    category: 'Apparel',
    priceCents: 349900,
    stock: 0,
    unitsSold: 212,
    status: 'out_of_stock',
    createdAt: new Date(now - 60 * 86400000).toISOString(),
    views: 6110,
  },
  {
    listingId: 'LST-004',
    asin: 'B07DEF3456',
    sku: 'PHIL-HUE-STARTER-4',
    productName: 'Philips Hue White & Colour Ambiance Starter Kit (4 Bulbs)',
    category: 'Smart Home',
    priceCents: 1299900,
    stock: 3,
    unitsSold: 19,
    status: 'active',
    createdAt: new Date(now - 7 * 86400000).toISOString(),
    views: 890,
  },
  {
    listingId: 'LST-005',
    asin: 'B06GHI7890',
    sku: 'WILD-STONE-ULTRA-100ML',
    productName: 'Wildstone Ultra Aqua Body Perfume (100ml)',
    category: 'Beauty & Grooming',
    priceCents: 39900,
    stock: 0,
    unitsSold: 604,
    status: 'inactive',
    createdAt: new Date(now - 90 * 86400000).toISOString(),
    views: 11240,
  },
];

const STATUS_CONFIG: Record<RegularListing['status'], { label: string; dot: string; text: string }> = {
  active:       { label: 'Active',        dot: 'bg-emerald-400', text: 'text-emerald-400' },
  inactive:     { label: 'Inactive',      dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
  out_of_stock: { label: 'Out of stock',  dot: 'bg-warning',    text: 'text-warning' },
};

const GRADE_COLOR: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-500/20 text-emerald-400',
  B: 'bg-brand/20 text-brand',
  C: 'bg-orange-500/20 text-orange-400',
};

// ─── Regular listings table ────────────────────────────────────────────────────
function RegularListingsTable({ listings }: { listings: RegularListing[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-border overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 border-b border-border bg-secondary/50 px-5 py-3">
        {['Product', 'SKU / ASIN', 'Price', 'Stock', 'Views', 'Status'].map((h) => (
          <p key={h} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{h}</p>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {listings.map((l) => {
          const st = STATUS_CONFIG[l.status];
          return (
            <div
              key={l.listingId}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 items-center px-5 py-4 transition-colors hover:bg-secondary/30"
            >
              {/* Product */}
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  {/* Placeholder image box */}
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg">
                    {l.category === 'Electronics' ? '🎧' :
                     l.category === 'Kitchen & Home' ? '🍲' :
                     l.category === 'Apparel' ? '👖' :
                     l.category === 'Smart Home' ? '💡' : '🧴'}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{l.productName}</p>
                    <p className="text-xs text-muted-foreground">{l.category} · Listed {daysAgo(l.createdAt)}</p>
                  </div>
                </div>
              </div>

              {/* SKU / ASIN */}
              <div>
                <p className="font-mono text-xs text-foreground">{l.sku}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{l.asin}</p>
              </div>

              {/* Price */}
              <p className="text-sm font-semibold text-foreground tabular-nums">{formatINR(l.priceCents)}</p>

              {/* Stock */}
              <div>
                <p className={`text-sm font-semibold tabular-nums ${l.stock === 0 ? 'text-warning' : 'text-foreground'}`}>
                  {l.stock}
                </p>
                <p className="text-xs text-muted-foreground">{l.unitsSold} sold</p>
              </div>

              {/* Views */}
              <p className="text-sm text-muted-foreground tabular-nums">{l.views.toLocaleString('en-IN')}</p>

              {/* Status */}
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full shrink-0 ${st.dot}`} />
                <span className={`text-xs font-semibold ${st.text}`}>{st.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Local routing cards ───────────────────────────────────────────────────────
function LocalRoutingCard({ item }: { item: ExchangeItem }) {
  const respondedCount = item.matchedBuyers.filter((b) => b.responded).length;

  return (
    <Link
      href={`/seller/listings/${item.returnId}`}
      className="group flex items-center gap-4 rounded-xl bg-card px-5 py-4 ring-1 ring-border transition-all hover:ring-emerald-500/40 hover:bg-emerald-500/5"
    >
      {/* Pulse indicator */}
      <div className="relative shrink-0">
        <div className="size-3 rounded-full bg-emerald-400" />
        <div className="absolute inset-0 size-3 animate-ping rounded-full bg-emerald-500/60" />
      </div>

      {/* Product info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${GRADE_COLOR[item.grade]}`}>
            Grade {item.grade}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
            Local Routing
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">{item.returnId}</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-foreground truncate">{item.productName}</p>
        <p className="text-xs text-muted-foreground">{item.category}</p>
      </div>

      {/* Buyer info */}
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-emerald-400">Buyer matched</p>
        <p className="text-xs text-muted-foreground">
          {respondedCount} of {item.matchedBuyers.length} responded
        </p>
      </div>

      {/* CO2 */}
      {item.co2SavedKg !== undefined && (
        <div className="shrink-0 rounded-lg bg-emerald-500/10 px-3 py-2 text-center">
          <p className="text-xs font-bold text-emerald-400">🌿 {item.co2SavedKg} kg</p>
          <p className="text-[10px] text-muted-foreground">CO₂ saved</p>
        </div>
      )}

      {/* Arrow */}
      <span className="shrink-0 text-muted-foreground transition-colors group-hover:text-emerald-400">→</span>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ListingsPage() {
  const [localRoutingListings, setLocalRoutingListings] = useState<ExchangeItem[]>([]);

  useEffect(() => {
    setLocalRoutingListings(getLocalRoutingListings());
  }, []);

  const activeRegular = REGULAR_LISTINGS.filter((l) => l.status === 'active').length;
  const totalActive = activeRegular + localRoutingListings.length;
  const totalSold = REGULAR_LISTINGS.reduce((s, l) => s + l.unitsSold, 0);

  return (
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Listings
      </span>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Manage Listings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {REGULAR_LISTINGS.length + localRoutingListings.length} total listings
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 transition-colors"
        >
          + Add listing
        </button>
      </div>

      {/* Stats bar */}
      <div className="mt-6 flex gap-4">
        {[
          { value: totalActive, label: 'Active' },
          { value: REGULAR_LISTINGS.filter((l) => l.status === 'out_of_stock').length, label: 'Out of stock' },
          { value: REGULAR_LISTINGS.filter((l) => l.status === 'inactive').length, label: 'Inactive' },
          { value: totalSold.toLocaleString('en-IN'), label: 'Units sold (all time)' },
          { value: localRoutingListings.length, label: 'Local routing active', highlight: true },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-xl px-5 py-3 ring-1 ${s.highlight ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-card ring-border'}`}
          >
            <p className={`text-2xl font-bold ${s.highlight ? 'text-emerald-400' : 'text-foreground'}`}>{s.value}</p>
            <p className={`text-xs ${s.highlight ? 'text-emerald-400/70' : 'text-muted-foreground'}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Local routing section — only when items exist */}
      {localRoutingListings.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Local Routing</h2>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              {localRoutingListings.length} active
            </span>
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs text-muted-foreground">AI-graded · buyer matched · no warehouse trip</p>
          </div>
          <div className="space-y-2">
            {localRoutingListings.map((item) => (
              <LocalRoutingCard key={item.returnId} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Regular listings table */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">All Listings</h2>
          <div className="h-px flex-1 bg-border" />
          <p className="text-xs text-muted-foreground">{REGULAR_LISTINGS.length} listings</p>
        </div>
        <RegularListingsTable listings={REGULAR_LISTINGS} />
      </div>

      {localRoutingListings.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Approve a Grade A return for local routing from the{' '}
          <Link href="/seller/returns" className="text-brand hover:underline">
            Returns queue
          </Link>{' '}
          — it will appear above with an AI grade badge.
        </p>
      )}
    </div>
  );
}
