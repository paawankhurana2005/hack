'use client';

import type { ImpactEstimate, OwnedItem, ProductHealthCard } from '@reloop/shared';
import { Button } from '@/components/ui/button';
import { HealthCard } from './health-card';

export function ConfirmedStep({
  item,
  card,
  impact,
  onViewListings,
}: {
  item: OwnedItem;
  card: ProductHealthCard | null;
  impact: ImpactEstimate | null;
  onViewListings: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="text-center">
        <span className="mx-auto grid size-12 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-lg text-brand">
          ✓
        </span>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-brand">
          Second_life_ready
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {item.title} is listed
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Its Health Card travels with it to its next owner. We&apos;ll match it to a nearby buyer —
          track it in My Listings.
        </p>
      </div>

      {impact && (
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-card p-4 text-center ring-1 ring-border">
            <p className="text-2xl font-semibold tabular-nums text-foreground">{impact.ecoCredits}</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              EcoCredits earned
            </p>
          </div>
          <div className="rounded-xl bg-card p-4 text-center ring-1 ring-border">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {impact.co2SavedKg}
              <span className="ml-1 text-base text-muted-foreground">kg</span>
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              CO₂ saved
            </p>
          </div>
        </div>
      )}

      {card && (
        <div className="mt-8">
          <HealthCard card={card} originalPrice={item.originalPrice} />
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={onViewListings}>
          View My Listings →
        </Button>
        <Button variant="secondary" href="/app/items">
          Back to My Items
        </Button>
      </div>
    </div>
  );
}
