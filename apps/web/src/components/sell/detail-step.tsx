'use client';

import type { OwnedItem } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';

function purchasedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function DetailStep({ item, onStart }: { item: OwnedItem; onStart: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      {/* Cover */}
      <Card className="overflow-hidden p-0">
        <div className="relative aspect-[4/3] bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
          <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
            {item.category}
          </span>
        </div>
      </Card>

      {/* Details */}
      <div className="flex flex-col">
        <Badge tone="accent">Your item</Badge>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{item.title}</h2>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Bought {purchasedOn(item.purchaseDate)} · paid {formatMoney(item.originalPrice)}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">{item.description}</p>

        <div className="mt-5 rounded-2xl bg-card p-5 ring-1 ring-border">
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Known specs</p>
          <div className="mt-3 space-y-px">
            {Object.entries(item.originalSpecs).map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-border/40 py-1.5"
              >
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {label}
                </span>
                <span className="font-mono text-xs text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Condition isn&apos;t set yet — the AI grades it from photos you take next, and checks it
          against the original listing.
        </p>

        <div className="mt-6">
          <Button variant="primary" className="w-full sm:w-auto" onClick={onStart}>
            Start selling →
          </Button>
        </div>
      </div>
    </div>
  );
}
