'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';
import { casualListings, type CasualListing, type ListingStatus } from '@/mock/casual-listings';
import { getListings } from '@/lib/listings-store';

const STATUS_TONE: Record<ListingStatus, 'neutral' | 'accent' | 'success'> = {
  listed: 'neutral',
  viewed: 'accent',
  matched: 'accent',
  sold: 'success',
};

const STATUS_LABEL: Record<ListingStatus, string> = {
  listed: 'Listed',
  viewed: 'Viewed',
  matched: 'Matched',
  sold: 'Sold',
};

function listedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export default function MyListingsPage() {
  // Start from the seed (SSR-stable), then merge in any user-created listings.
  const [listings, setListings] = useState<CasualListing[]>(casualListings);
  useEffect(() => {
    setListings(getListings());
  }, []);

  return (
    <PageShell
      eyebrow="Second life"
      title="My Listings"
      description="Items you've put up for a second life. Casual selling — lightweight and matched locally by Amazon."
    >
      {listings.length === 0 ? (
        <Card className="border border-dashed border-border ring-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            No listings yet
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            When you sell an item from <span className="text-foreground">My Items</span>, it shows up
            here so you can track views and matches.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <Card key={listing.id} className="flex flex-col overflow-hidden p-0">
              <div className="relative aspect-[4/3] overflow-hidden bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={listing.imageUrl} alt={listing.title} className="h-full w-full object-cover" />
                <span className="absolute right-3 top-3">
                  <Badge tone={STATUS_TONE[listing.status]}>{STATUS_LABEL[listing.status]}</Badge>
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h2 className="font-semibold tracking-tight text-foreground">{listing.title}</h2>
                <p className="mt-2 text-lg font-semibold tabular-nums text-brand">
                  {formatMoney(listing.listedPrice)}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>Listed {listedOn(listing.listedAt)}</span>
                  <span>{listing.views ?? 0} views</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
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
