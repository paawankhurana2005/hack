import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { findOwnedItem } from '@/mock/owned-items';
import { SellSession } from '@/components/sell/sell-session';

export default function SellItemPage({ params }: { params: { itemId: string } }) {
  const item = findOwnedItem(params.itemId);

  if (!item) {
    return (
      <PageShell eyebrow="Sell" title="Item not found">
        <Card>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t find that item in your account.
          </p>
          <Link
            href="/app/items"
            className="mt-4 inline-flex text-sm font-medium text-brand hover:gap-1"
          >
            ← Back to My Items
          </Link>
        </Card>
      </PageShell>
    );
  }

  return <SellSession item={item} />;
}
