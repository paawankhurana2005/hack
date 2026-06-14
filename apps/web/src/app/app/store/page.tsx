'use client';

import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/money';
import { storeProducts } from '@/mock/store-products';

/** "Buy new" storefront — the surface where Return Prevention meets the shopper. */
export default function StorePage() {
  return (
    <PageShell
      eyebrow="Store · buy new"
      title="Shop new on Amazon"
      description="Before you buy, ReLoop predicts how likely your choice is to come back — and helps you get it right the first time. The best return is the one that never happens."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {storeProducts.map((p) => {
          const predictive = !!p.predictions;
          return (
            <Link key={p.id} href={`/app/store/${p.id}`} className="group">
              <Card className="flex h-full flex-col overflow-hidden p-0 transition-colors group-hover:ring-brand/50">
                <div className="relative aspect-[4/3] overflow-hidden bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                    {p.brand}
                  </span>
                  {predictive && (
                    <span className="absolute right-3 top-3 rounded-full bg-brand/20 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand backdrop-blur">
                      Return insight
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-semibold tracking-tight text-foreground">{p.title}</h2>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    ★ {p.rating.toFixed(1)} · {p.ratingCount.toLocaleString('en-IN')} ratings
                  </p>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  <div className="mt-5 flex-1" />
                  <p className="text-2xl font-semibold tabular-nums text-brand">
                    {formatMoney(p.price)}
                  </p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
