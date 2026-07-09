import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';
import type { ShopEntry } from '@/lib/market';

const gradeTone = {
  new: 'success',
  'like-new': 'success',
  good: 'accent',
  fair: 'warning',
  poor: 'danger',
} as const;

export function ShopCard({
  item,
  sold,
  priceCents,
}: {
  item: ShopEntry;
  sold?: boolean;
  priceCents?: number;
}) {
  const { card } = item;
  const price = { amountCents: priceCents ?? item.listingPrice.amountCents, currency: 'INR' as const };
  const discount = Math.round((1 - price.amountCents / item.originalPrice.amountCents) * 100);

  return (
    <Link href={`/app/shop/${item.id}`} className="group block">
      <Card className="flex h-full flex-col overflow-hidden p-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-2xl group-hover:shadow-brand/10 group-hover:ring-brand/40">
        <div className="relative aspect-[4/3] overflow-hidden bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={card.title}
            className={`h-full w-full object-cover ${sold ? 'opacity-40 grayscale' : ''}`}
          />
          {/* Trust badges over the photo */}
          <span className="absolute left-3 top-3">
            <Badge tone={gradeTone[card.grade]}>{card.grade}</Badge>
          </span>
          {card.authenticityVerified && (
            <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand backdrop-blur">
              ✓ Verified
            </span>
          )}
          {!sold && (item.openBox || card.packagingSealed === false) && (
            <span className="absolute inset-x-3 bottom-3 flex flex-col items-start gap-1">
              {item.openBox && (
                <span className="rounded-full bg-brand/90 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand-foreground backdrop-blur">
                  Open-box · doorstep graded
                </span>
              )}
              {card.packagingSealed === false && (
                <span className="rounded-full bg-orange/90 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white backdrop-blur">
                  Packaging not included
                </span>
              )}
            </span>
          )}
          {sold && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="rounded-full border border-border bg-background/80 px-4 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground backdrop-blur">
                Sold
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {item.category} · {item.sellerName}
          </span>
          <h3 className="mt-1 font-semibold tracking-tight text-foreground">{card.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{card.summary}</p>

          <div className="mt-3 flex items-end gap-2">
            <span className="text-xl font-semibold tabular-nums text-brand">
              {formatMoney(price)}
            </span>
            <span className="pb-0.5 text-xs text-muted-foreground line-through">
              {formatMoney(item.originalPrice)}
            </span>
            {discount > 0 && (
              <span className="pb-0.5 font-mono text-[10px] uppercase tracking-widest text-brand">
                {discount}% off
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
            <span className="size-1.5 rounded-full bg-brand" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Saves {item.impact.co2SavedKg} kg CO₂ vs new
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
