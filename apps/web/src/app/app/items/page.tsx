'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';
import { useRole } from '@/lib/role-context';
import { getOwnedItems, type UserOwnedItem } from '@/mock/owned-items';
import { getSubmittedReturns, type SubmittedReturn } from '@/lib/mocks/return-store';

const RETURN_STATUS_LABEL: Record<SubmittedReturn['status'], string> = {
  awaiting_pickup: 'Pickup scheduled',
  in_transit: 'In transit',
  processed: 'Returned',
  pending_seller_approval: 'Pickup scheduled',
  seller_approved: 'In transit',
  deal_completed: 'Returned',
};

function purchasedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function daysLeft(iso?: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
}

export default function MyItemsPage() {
  const { accountId } = useRole();
  const [items, setItems] = useState<UserOwnedItem[]>([]);
  const [returns, setReturns] = useState<SubmittedReturn[]>([]);

  useEffect(() => {
    if (!accountId) return;
    setItems(getOwnedItems(accountId));
    setReturns(getSubmittedReturns());
  }, [accountId]);

  // The return started for this item (if any), by order id.
  const returnFor = (item: UserOwnedItem): SubmittedReturn | undefined =>
    item.orderId ? returns.find((r) => r.orderId === item.orderId) : undefined;

  // Only return-window items are shown here — resell is intentionally not surfaced.
  const eligible = items.filter((i) => i.returnEligible);

  return (
    <PageShell
      eyebrow="Your stuff"
      title="My Items"
      description="Everything you bought from the store that's still in its return window. Start a doorstep return and the AI grades it before it moves."
    >
      {eligible.length === 0 ? (
        <Card className="border border-dashed border-border ring-0">
          <p className="text-sm text-muted-foreground">Nothing in its return window right now.</p>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {eligible.map((item) => {
            const left = daysLeft(item.returnByDate);
            const ret = returnFor(item);
            const inactive = !!ret;
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
                    {ret ? (
                      <Badge tone="success">{RETURN_STATUS_LABEL[ret.status]}</Badge>
                    ) : left !== null ? (
                      <Badge tone="accent">{left > 0 ? `${left}d left` : 'Last day'}</Badge>
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

                  {/* Footer reflects the item's live return state */}
                  {ret ? (
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
