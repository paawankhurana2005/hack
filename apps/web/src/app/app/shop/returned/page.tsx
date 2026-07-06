'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { ShopCard } from '@/components/shop/shop-card';
import { getReturnedShopEntries, type ShopEntry } from '@/lib/market';
import { getSoldIds } from '@/lib/marketplace-store';
import { getAgentState } from '@/lib/agent-store';
import { useRole } from '@/lib/role-context';

export default function ReturnedShopPage() {
  const { accountId } = useRole();
  const [entries, setEntries] = useState<ShopEntry[]>([]);
  const [soldIds, setSoldIds] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!accountId) return;
    const list = getReturnedShopEntries(accountId);
    setEntries(list);
    setSoldIds(getSoldIds());
    const map: Record<string, number> = {};
    for (const it of list) {
      const a = getAgentState(it.id);
      if (a) map[it.id] = a.priceCents;
    }
    setPrices(map);
  }, [accountId]);

  return (
    <PageShell
      eyebrow="Shop · returned & verified"
      title="Returned & Verified"
      description="Every item here started as a customer return — doorstep-graded, physically re-checked at a local hub, and re-listed only when it earns a real second life. Condition, authenticity, and (where relevant) packaging status are called out on every card, not buried in fine print."
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/app/shop"
          className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-brand transition-colors hover:bg-brand/20"
        >
          ← Back to the full marketplace
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hub-verified returns are listed right now — check back soon.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((item) => (
            <ShopCard
              key={item.id}
              item={item}
              sold={soldIds.includes(item.id)}
              priceCents={prices[item.id]}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
