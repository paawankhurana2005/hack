import Link from 'next/link';
import type { MeshListing } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';
import { formatDistance, quote } from '@/lib/mesh';

/** A borrowable item in the neighborhood grid — links to the rent flow. */
export function ListingCard({ listing }: { listing: MeshListing }) {
  // Headline savings use a single-day rent vs buying new.
  const q = quote(listing.dailyRate, listing.deposit, listing.newPrice, 1);

  return (
    <Link href={`/app/mesh/${listing.id}`} className="group">
      <Card className="flex h-full flex-col overflow-hidden p-0 transition-colors group-hover:ring-brand/50">
        <div className="relative aspect-[4/3] overflow-hidden bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={listing.imageUrl} alt={listing.title} className="h-full w-full object-cover" />
          <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
            {formatDistance(listing.distanceM)} away
          </span>
          <span className="absolute right-3 top-3">
            <Badge tone="accent">Save {q.savedPct}% vs new</Badge>
          </span>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <h3 className="font-semibold tracking-tight text-foreground">{listing.title}</h3>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            ★ {listing.rating.toFixed(1)} · {listing.lenderName} · lent {listing.lentCount}×
          </p>
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{listing.blurb}</p>
          <div className="mt-5 flex-1" />
          <div className="flex items-end justify-between">
            <p className="text-2xl font-semibold tabular-nums text-brand">
              {formatMoney(listing.dailyRate)}
              <span className="text-sm font-normal text-muted-foreground">/day</span>
            </p>
            <span className="font-mono text-[10px] uppercase tracking-widest text-brand">
              {listing.availability}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
