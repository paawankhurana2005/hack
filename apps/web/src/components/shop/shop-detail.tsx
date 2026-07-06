'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { estimateBuyerImpact, type Money } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HealthCard } from '@/components/sell/health-card';
import { HealthCardHistory } from '@/components/sell/health-card-history';
import { RufusChat } from '@/components/rufus/rufus-chat';
import { formatMoney } from '@/lib/money';
import { buyItem, isSold, type PurchaseResult } from '@/lib/marketplace-store';
import { getAgentState } from '@/lib/agent-store';
import { recordSale } from '@/lib/sale-store';
import { earnFor } from '@/lib/credits-store';
import { completeReturnSale } from '@/lib/return-market';
import type { ShopEntry } from '@/lib/market';

const inr = (cents: number): Money => ({ amountCents: cents, currency: 'INR' });

export function ShopDetail({ item }: { item: ShopEntry }) {
  const { card } = item;
  const [alreadySold, setAlreadySold] = useState(false);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  // If the seller's agent has repriced this item, sell at that live price so the
  // sale stays consistent with the agent's own history.
  const [priceCents, setPriceCents] = useState(item.listingPrice.amountCents);

  useEffect(() => {
    setAlreadySold(isSold(item.id));
    const agent = getAgentState(item.id);
    if (agent) setPriceCents(agent.priceCents);
  }, [item.id]);

  const price = inr(priceCents);
  const discount = Math.round((1 - priceCents / item.originalPrice.amountCents) * 100);
  const buyerPreview = estimateBuyerImpact(item.category, item.originalPrice, price);
  const sold = alreadySold || result !== null;

  function buy() {
    const res = buyItem(item, priceCents);
    recordSale({
      id: item.id,
      title: card.title,
      soldPriceCents: priceCents,
      originalPriceCents: item.originalPrice.amountCents,
      sellerCredits: res.sellerCredits,
      co2SavedKg: res.co2SavedKg,
      soldAt: new Date().toISOString(),
    });
    // The SELLER (a different account) gets paid into their own ledger.
    earnFor(item.sellerId, res.sellerCredits, `Sold ${card.title}`);
    // Spec 016: if this was a hub-dispatched RETURN, the purchase closes its
    // lifecycle (listed_local → sold → delivered_to_buyer) and retires the agent.
    completeReturnSale(item.id, priceCents, res.sellerCredits);
    setResult(res);
    setAlreadySold(true);
  }

  return (
    <PageShell eyebrow={`Shop · ${item.category}`} title={card.title}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Left: photo + buy panel */}
        <div className="space-y-6">
          <Card className="overflow-hidden p-0">
            <div className="relative aspect-[4/3] bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={card.title}
                className={`h-full w-full object-cover ${sold ? 'opacity-50 grayscale' : ''}`}
              />
              <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                {item.sellerName}
              </span>
              {item.openBox && !sold && (
                <span className="absolute bottom-3 left-3 rounded-full bg-brand/90 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand-foreground backdrop-blur">
                  Open-box · doorstep graded · hub verified
                </span>
              )}
            </div>
          </Card>

          {result ? (
            <Card className="ring-brand/40">
              <div className="flex items-center gap-3">
                <span className="grid size-9 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-sm text-brand">
                  ✓
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                    Purchase complete
                  </p>
                  <p className="text-sm text-foreground">A second life begins.</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-2xl font-semibold tabular-nums text-brand">+{result.buyerCredits}</p>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    You earned
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-2xl font-semibold tabular-nums text-foreground">+{result.sellerCredits}</p>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    Seller earned
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {result.co2SavedKg}
                    <span className="text-sm text-muted-foreground">kg</span>
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    CO₂ saved
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="primary" href="/app/shop">
                  Keep shopping →
                </Button>
                <Button variant="secondary" href="/app/listings">
                  See it in My Listings
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Price
                  </p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-brand">
                    {formatMoney(price)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="line-through">{formatMoney(item.originalPrice)}</span> new ·{' '}
                    <span className="text-brand">{discount}% off</span>
                  </p>
                </div>
                {card.authenticityVerified && <Badge tone="success">✓ Verified</Badge>}
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface p-3">
                <span className="size-1.5 rounded-full bg-brand" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Choose second-life · earn{' '}
                  <span className="text-brand">{buyerPreview.ecoCredits} EcoCredits</span> · save{' '}
                  {buyerPreview.co2SavedKg} kg CO₂
                </span>
              </div>

              {sold ? (
                <div className="mt-5 rounded-lg border border-border bg-secondary px-4 py-2.5 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Sold
                </div>
              ) : (
                <Button variant="primary" className="mt-5 w-full" onClick={buy}>
                  Buy it · {formatMoney(price)}
                </Button>
              )}
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Simulated checkout · demo
              </p>
            </Card>
          )}
        </div>

        {/* Right: the full Product Health Card (trust layer) */}
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-brand">
            Product Health Card
          </p>
          <HealthCard card={card} originalPrice={item.originalPrice} />
          <div className="mt-6">
            <HealthCardHistory card={card} category={item.category} sellerName={item.sellerName} />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Link href="/app/shop" className="text-sm font-medium text-brand hover:gap-1">
          ← Back to Shop
        </Link>
      </div>

      {/* Rufus — Health-Card-aware shopping assistant for this item */}
      <RufusChat
        listingId={item.id}
        context={{
          title: card.title,
          category: item.category,
          grade: card.grade,
          confidence: card.confidence,
          summary: card.summary,
          detectedIssues: card.detectedIssues,
          authenticityVerified: card.authenticityVerified,
          listingPriceInr: priceCents / 100,
          originalPriceInr: item.originalPrice.amountCents / 100,
          co2SavedKg: item.impact.co2SavedKg,
          ecoCredits: item.impact.ecoCredits,
          sellerName: item.sellerName,
        }}
      />
    </PageShell>
  );
}
