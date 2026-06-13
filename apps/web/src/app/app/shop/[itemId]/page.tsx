import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { findShopItem } from '@/mock/shop-items';
import { ShopDetail } from '@/components/shop/shop-detail';

export default function ShopItemPage({ params }: { params: { itemId: string } }) {
  const item = findShopItem(params.itemId);

  if (!item) {
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
