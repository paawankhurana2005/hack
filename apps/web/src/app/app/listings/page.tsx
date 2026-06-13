'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PriceSparkline } from '@/components/agent/price-sparkline';
import { formatMoney } from '@/lib/money';
import type { CasualListing, ListingStatus } from '@/mock/casual-listings';
import { getListings } from '@/lib/listings-store';
import { seedListings } from '@/mock/seed-listings';
import { isSold } from '@/lib/marketplace-store';
import { getSale, type SellerSale } from '@/lib/sale-store';
import { ensureAgent, type AgentState } from '@/lib/agent-store';
import { useRole } from '@/lib/role-context';

type Filter = 'all' | 'active' | 'sold';
const ACTIVE_STATUSES: ListingStatus[] = ['listed', 'viewed', 'matched'];

const STATUS_TONE: Record<ListingStatus, 'neutral' | 'accent' | 'success'> = {
  listed: 'neutral',
  viewed: 'accent',
  matched: 'accent',
  sold: 'success',
  recycled: 'neutral',
  donated: 'neutral',
};

const STATUS_LABEL: Record<ListingStatus, string> = {
  listed: 'Listed',
  viewed: 'Viewed',
  matched: 'Matched',
  sold: 'Sold',
  recycled: 'Recycled',
  donated: 'Donated',
};

function listedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function agentChip(a: AgentState): { label: string; tone: 'neutral' | 'accent' } {
  if (a.routeRecommendation && a.status !== 'recycled' && a.status !== 'donated')
    return { label: '♻ Recommending recycle', tone: 'accent' };
  if (a.status === 'recycled' || a.status === 'donated') return { label: 'Routed', tone: 'neutral' };
  if (a.status === 'sold') return { label: 'Sold', tone: 'neutral' };
  if (a.paused) return { label: 'Agent paused', tone: 'neutral' };
  return { label: `Agent active · day ${a.day}`, tone: 'accent' };
}

export default function MyListingsPage() {
  const { accountId } = useRole();
  const [listings, setListings] = useState<CasualListing[]>([]);
  const [agents, setAgents] = useState<Record<string, AgentState>>({});
  const [sales, setSales] = useState<Record<string, SellerSale>>({});
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!accountId) return;
    // Shared listing pool + seeds, scoped to the signed-in seller.
    const all = [...getListings(), ...seedListings].filter((l) => l.sellerId === accountId);
    const seen = new Set<string>();
    const deduped = all.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
    setListings(deduped);

    const map: Record<string, AgentState> = {};
    const saleMap: Record<string, SellerSale> = {};
    for (const l of deduped) {
      const a = ensureAgent(l);
      if (isSold(l.id) && a.status !== 'sold') a.status = 'sold';
      map[l.id] = a;
      const s = getSale(l.id);
      if (s) saleMap[l.id] = s;
    }
    setAgents(map);
    setSales(saleMap);
  }, [accountId]);

  const statusOf = (l: CasualListing): ListingStatus =>
    agents[l.id]?.status ?? (isSold(l.id) ? 'sold' : l.status);
  const isActive = (l: CasualListing) => ACTIVE_STATUSES.includes(statusOf(l));
  const visible = listings.filter((l) =>
    filter === 'all' ? true : filter === 'active' ? isActive(l) : !isActive(l),
  );
  const counts = {
    all: listings.length,
    active: listings.filter(isActive).length,
    sold: listings.filter((l) => !isActive(l)).length,
  };

  return (
    <PageShell
      eyebrow="Second life"
      title="My Listings"
      description="Items you've put up for a second life. An autonomous agent watches each one, repricing or re-routing it within hard guardrails — tap a listing to see it reason."
    >
      {/* Active / Sold filter */}
      <div className="mb-6 flex gap-2">
        {(['all', 'active', 'sold'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              filter === f
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-border text-muted-foreground hover:text-brand'
            }`}
          >
            {f} · {counts[f]}
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((listing) => {
          const agent = agents[listing.id];
          const sale = sales[listing.id];
          const status: ListingStatus = agent?.status ?? (isSold(listing.id) ? 'sold' : listing.status);
          const priceCents = sale?.soldPriceCents ?? agent?.priceCents ?? listing.listedPrice.amountCents;
          const routedOrSold = status === 'sold' || status === 'recycled' || status === 'donated';
          const chip =
            status === 'sold' && sale
              ? { label: `Sold · +${sale.sellerCredits} credits`, tone: 'accent' as const }
              : agent
                ? agentChip(agent)
                : null;
          return (
            <Link key={listing.id} href={`/app/listings/${listing.id}`} className="group block">
              <Card className="flex h-full flex-col overflow-hidden p-0 transition-all group-hover:ring-brand/40">
                <div className="relative aspect-[4/3] overflow-hidden bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={listing.imageUrl}
                    alt={listing.title}
                    className={`h-full w-full object-cover ${routedOrSold ? 'opacity-50 grayscale' : ''}`}
                  />
                  <span className="absolute right-3 top-3">
                    <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                  </span>
                  {chip && (
                    <span className="absolute bottom-3 left-3">
                      <Badge tone={chip.tone}>{chip.label}</Badge>
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-semibold tracking-tight text-foreground">{listing.title}</h2>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-lg font-semibold tabular-nums text-brand">
                      {formatMoney({ amountCents: priceCents, currency: 'INR' })}
                    </p>
                    {agent && <PriceSparkline history={agent.priceHistory} floorCents={agent.floorCents} />}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Listed {listedOn(listing.listedAt)}</span>
                    <span className="text-brand">{routedOrSold ? 'See story →' : 'View agent →'}</span>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {visible.length === 0 && (
        <Card className="border border-dashed border-border ring-0">
          <p className="text-sm text-muted-foreground">
            No {filter} listings yet.
          </p>
        </Card>
      )}

      <Card className="mt-8">
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Casual vs Pro selling
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This is your <span className="text-foreground">casual</span> seller space — lightweight and
          built into your account. High-volume sellers get the full{' '}
          <span className="text-foreground">pro dashboard</span> (inventory, insights, returns
          routing) by signing in as a Seller.
        </p>
      </Card>
    </PageShell>
  );
}
