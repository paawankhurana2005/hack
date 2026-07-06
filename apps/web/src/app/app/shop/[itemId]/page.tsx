'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { findShopEntry, type ShopEntry } from '@/lib/market';
import { logListingEvent } from '@/lib/api-client';
import { ShopDetail } from '@/components/shop/shop-detail';

export default function ShopItemPage() {
  const params = useParams();
  const id = Array.isArray(params.itemId) ? params.itemId[0]! : (params.itemId as string);
  const [item, setItem] = useState<ShopEntry | null | undefined>(undefined);

  useEffect(() => {
    setItem(findShopEntry(id) ?? null);
  }, [id]);

  // Real per-listing engagement signal (spec 024, phase 3) — feeds the reprice
  // engine's viewVelocity24h/viewVelocityTrend instead of a client simulation.
  useEffect(() => {
    if (!id) return;
    void logListingEvent(id, 'view').catch(() => {});
  }, [id]);

  if (item === undefined) return <PageShell eyebrow="Shop" title="Item" />;
  if (item === null) {
    return (
      <PageShell eyebrow="Shop" title="Item not found">
        <Card>
          <p className="text-sm text-muted-foreground">This item is no longer available.</p>
          <Link href="/app/shop" className="mt-4 inline-flex text-sm font-medium text-brand">
            ← Back to Shop
          </Link>
        </Card>
      </PageShell>
    );
  }

  return <ShopDetail item={item} />;
}
