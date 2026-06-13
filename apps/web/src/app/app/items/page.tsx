import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import { ownedItems } from '@/mock/owned-items';

function purchasedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export default function MyItemsPage() {
  return (
    <PageShell
      eyebrow="Your stuff"
      title="My Items"
      description="Things you own. Give the ones you no longer need a second life — we grade, price, and match."
    >
      {ownedItems.length === 0 ? (
        <Card className="border border-dashed border-border ring-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Nothing here yet
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Items you buy on Amazon will show up here, ready to re-loop when you&apos;re done with them.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ownedItems.map((item) => (
            <Card key={item.id} className="flex flex-col overflow-hidden p-0">
              <div className="relative aspect-[4/3] overflow-hidden bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                  {item.category}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h2 className="font-semibold tracking-tight text-foreground">{item.title}</h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Bought {purchasedOn(item.purchaseDate)} · {formatMoney(item.originalPrice)}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>
                <div className="mt-5 flex-1" />
                <Button variant="primary" className="w-full" href={`/app/sell/${item.id}`}>
                  Sell this item →
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
