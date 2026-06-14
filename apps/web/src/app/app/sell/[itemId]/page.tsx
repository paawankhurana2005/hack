'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { findOwnedItem, type UserOwnedItem } from '@/mock/owned-items';
import { findAcquiredItem } from '@/lib/acquired-store';
import { useRole } from '@/lib/role-context';
import { SellSession } from '@/components/sell/sell-session';

export default function SellItemPage({ params }: { params: { itemId: string } }) {
  const { accountId } = useRole();
  const [item, setItem] = useState<UserOwnedItem | undefined>();
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    // Resolve from the static order history OR anything the user bought through
    // ReLoop (acquired items live in localStorage, so this must run client-side).
    setItem(findOwnedItem(params.itemId) ?? findAcquiredItem(params.itemId, accountId ?? undefined));
    setResolved(true);
  }, [params.itemId, accountId]);

  if (!resolved) return null;

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
