'use client';

import type { ImpactEstimate, OwnedItem } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ConfirmedStep({
  item,
  impact,
  onViewListings,
}: {
  item: OwnedItem;
  impact: ImpactEstimate | null;
  onViewListings: () => void;
}) {
  return (
    <Card className="mx-auto max-w-xl text-center">
      <div className="flex flex-col items-center">
        <span className="grid size-12 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-lg text-brand">
          ✓
        </span>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-brand">
          Second_life_ready
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {item.title} is listed
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your Health Card travels with it to its next owner. We&apos;ll match it to a nearby buyer —
          you&apos;ll see updates in My Listings.
        </p>

        {impact && (
          <div className="mt-6 grid w-full grid-cols-2 gap-4">
            <div className="rounded-xl bg-background/60 p-4">
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {impact.ecoCredits}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                EcoCredits earned
              </p>
            </div>
            <div className="rounded-xl bg-background/60 p-4">
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

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={onViewListings}>
            View My Listings →
          </Button>
          <Button variant="secondary" href="/app/items">
            Back to My Items
          </Button>
        </div>
      </div>
    </Card>
  );
}
