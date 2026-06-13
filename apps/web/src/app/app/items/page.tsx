'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';
import { useRole } from '@/lib/role-context';
import { getOwnedItems, type UserOwnedItem } from '@/mock/owned-items';
import { getSubmittedReturns, type SubmittedReturn } from '@/lib/mocks/return-store';
import { getListings } from '@/lib/listings-store';
import { isSold } from '@/lib/marketplace-store';
import type { CasualListing } from '@/mock/casual-listings';

const RETURN_STATUS_LABEL: Record<SubmittedReturn['status'], string> = {
  awaiting_pickup: 'Pickup scheduled',
  in_transit: 'In transit',
  processed: 'Returned',
};

function purchasedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function daysLeft(iso?: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
}

type Tab = 'return' | 'resell';

export default function MyItemsPage() {
  const { accountId } = useRole();
  const [items, setItems] = useState<UserOwnedItem[]>([]);
  const [returns, setReturns] = useState<SubmittedReturn[]>([]);
  const [listings, setListings] = useState<CasualListing[]>([]);
  const [tab, setTab] = useState<Tab>('return');

  useEffect(() => {
    if (!accountId) return;
    setItems(getOwnedItems(accountId));
    setReturns(getSubmittedReturns());
    setListings(getListings().filter((l) => l.sellerId === accountId));
  }, [accountId]);

  // The return started for this item (if any), by order id.
  const returnFor = (item: UserOwnedItem): SubmittedReturn | undefined =>
    item.orderId ? returns.find((r) => r.orderId === item.orderId) : undefined;
  // The listing created from this item (if any).
  const listingFor = (item: UserOwnedItem): CasualListing | undefined =>
    listings.find((l) => l.sourceItemId === item.id);

  const eligible = items.filter((i) => i.returnEligible);
  const resell = items.filter((i) => !i.returnEligible);
  const shown = tab === 'return' ? eligible : resell;

  // Default to whichever tab has items so the demo never opens on an empty tab.
  useEffect(() => {
    if (eligible.length === 0 && resell.length > 0) setTab('resell');
  }, [eligible.length, resell.length]);

  return (
    <PageShell
      eyebrow="Your stuff"
      title="My Items"
      description="Everything you bought from the store. Recently delivered? Return it. Past the window? Give it a second life."
    >
      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('return')}
          className={`rounded-full border px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
            tab === 'return'
              ? 'border-brand bg-brand/10 text-brand'
              : 'border-border text-muted-foreground hover:text-brand'
          }`}
        >
          Eligible for return · {eligible.length}
        </button>
        <button
          type="button"
          onClick={() => setTab('resell')}
          className={`rounded-full border px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
            tab === 'resell'
              ? 'border-brand bg-brand/10 text-brand'
              : 'border-border text-muted-foreground hover:text-brand'
          }`}
        >
          Resell · {resell.length}
        </button>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        {tab === 'return'
          ? 'Within the return window — start a doorstep return and the AI grades it before it moves.'
          : 'Past the return window — sell it for a second life. The AI grades, prices, and matches it locally.'}
      </p>

      {shown.length === 0 ? (
        <Card className="border border-dashed border-border ring-0">
          <p className="text-sm text-muted-foreground">
            {tab === 'return'
              ? 'Nothing in its return window right now.'
              : 'Nothing to resell right now.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => {
            const left = daysLeft(item.returnByDate);
            const ret = returnFor(item);
            const lst = listingFor(item);
            const lstSold = lst ? isSold(lst.id) : false;
            const inactive = !!ret || !!lst;
            return (
              <Card key={item.id} className="flex flex-col overflow-hidden p-0">
                <div className="relative aspect-[4/3] overflow-hidden bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className={`h-full w-full object-cover ${inactive ? 'opacity-70' : ''}`}
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                    {item.category}
                  </span>
                  <span className="absolute right-3 top-3">
                    {tab === 'return' ? (
                      ret ? (
                        <Badge tone="success">{RETURN_STATUS_LABEL[ret.status]}</Badge>
                      ) : left !== null ? (
                        <Badge tone="accent">{left > 0 ? `${left}d left` : 'Last day'}</Badge>
                      ) : null
                    ) : lst ? (
                      <Badge tone={lstSold ? 'success' : 'accent'}>{lstSold ? 'Sold' : 'Listed'}</Badge>
                    ) : null}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-semibold tracking-tight text-foreground">{item.title}</h2>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Bought {purchasedOn(item.purchaseDate)} · {formatMoney(item.originalPrice)}
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>
                  <div className="mt-5 flex-1" />

                  {/* Footer reflects the item's live state */}
                  {tab === 'return' ? (
                    ret ? (
                      <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                          Return {RETURN_STATUS_LABEL[ret.status]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ret.status === 'processed'
                            ? 'Picked up and graded at the doorstep.'
                            : 'Amazon agent dispatched — graded before it moves.'}
                        </p>
                      </div>
                    ) : (
                      <Button variant="primary" className="w-full" href={`/return/${item.orderId}`}>
                        Return this item →
                      </Button>
                    )
                  ) : lst ? (
                    <Link
                      href={`/app/listings/${lst.id}`}
                      className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/5 p-3 transition-colors hover:border-brand/60"
                    >
                      <span>
                        <span className="block font-mono text-[10px] uppercase tracking-widest text-brand">
                          {lstSold ? 'Sold' : 'Listed for resale'}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {lstSold ? 'See the sale & impact' : 'The agent is managing it'}
                        </span>
                      </span>
                      <span className="font-mono text-xs text-brand">View →</span>
                    </Link>
                  ) : (
                    <Button variant="primary" className="w-full" href={`/app/sell/${item.id}`}>
                      Sell this item →
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
