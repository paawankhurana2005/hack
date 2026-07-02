'use client';

// Spec 016 Stage 7 — the open-box surface: a hub-dispatched RETURN of this exact
// product, surfaced on the buy-new page as an additive recommendation ("you
// wishlisted this — here's a doorstep-graded unit 4km away, X% off"). Buying it
// is a real cross-account purchase that closes the return's lifecycle.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Money } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import { findOpenBoxOffer, completeReturnSale, type OpenBoxOffer } from '@/lib/return-market';
import { matchReasonLine } from '@/lib/demand-graph';
import { findShopEntry } from '@/lib/market';
import { buyItem, isSold, type PurchaseResult } from '@/lib/marketplace-store';
import { earnFor } from '@/lib/credits-store';
import { recordSale } from '@/lib/sale-store';
import { currentAccountId } from '@/lib/storage';

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

export function OpenBoxOfferCard({
  productId,
  newPriceCents,
}: {
  productId: string;
  newPriceCents: number;
}) {
  const [offer, setOffer] = useState<OpenBoxOffer | null>(null);
  const [matchLine, setMatchLine] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  useEffect(() => {
    const found = findOpenBoxOffer(productId);
    // Never offer the viewer their own hub's listing.
    if (found && found.listing.sellerId === currentAccountId()) {
      setOffer(null);
      return;
    }
    setOffer(found);
    setMatchLine(matchReasonLine(currentAccountId(), productId));
  }, [productId]);

  if (!offer || (isSold(offer.listing.id) && !result)) return null;

  const grade = offer.listing.card?.grade ?? offer.listing.grade ?? 'good';
  const savePct = Math.round((1 - offer.priceCents / newPriceCents) * 100);

  function buy() {
    if (!offer) return;
    const entry = findShopEntry(offer.listing.id);
    if (!entry) return;
    const res = buyItem(entry, offer.priceCents);
    recordSale({
      id: entry.id,
      title: entry.card.title,
      soldPriceCents: offer.priceCents,
      originalPriceCents: entry.originalPrice.amountCents,
      sellerCredits: res.sellerCredits,
      co2SavedKg: res.co2SavedKg,
      soldAt: new Date().toISOString(),
    });
    earnFor(entry.sellerId, res.sellerCredits, `Sold ${entry.card.title} (open-box)`);
    completeReturnSale(entry.id, offer.priceCents, res.sellerCredits);
    setResult(res);
  }

  if (result) {
    return (
      <Card className="ring-brand/40">
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Open-box purchase complete
        </p>
        <p className="mt-1 text-sm text-foreground">
          It never went near a warehouse — you earned{' '}
          <span className="font-semibold text-brand">+{result.buyerCredits} EcoCredits</span> and
          saved {result.co2SavedKg} kg CO₂.
        </p>
      </Card>
    );
  }

  return (
    <Card className="ring-brand/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            Open-box near you · graded at the doorstep
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-brand">
            {formatMoney(inr(offer.priceCents))}
            <span className="ml-2 align-middle font-mono text-[10px] uppercase tracking-widest text-success">
              save {savePct}% vs new
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Hub-verified · {offer.distanceKm}km away · delivered today · full Amazon guarantee
          </p>
          {matchLine && <p className="mt-1 text-xs text-brand">{matchLine}</p>}
        </div>
        <Badge tone="success">{grade}</Badge>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={buy}>
          Buy open-box · {formatMoney(inr(offer.priceCents))}
        </Button>
        <Link
          href={`/app/shop/${offer.listing.id}`}
          className="text-sm font-medium text-brand hover:underline"
        >
          View Health Card →
        </Link>
      </div>
    </Card>
  );
}
