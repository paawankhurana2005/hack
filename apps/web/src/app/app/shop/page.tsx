'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { ShopCard } from '@/components/shop/shop-card';
import { getShopEntries, type ShopEntry } from '@/lib/market';
import { getSoldIds } from '@/lib/marketplace-store';
import { getBalance } from '@/lib/credits-store';
import { getAgentState } from '@/lib/agent-store';
import { useRole } from '@/lib/role-context';

export default function ShopPage() {
  const { accountId } = useRole();
  const [entries, setEntries] = useState<ShopEntry[]>([]);
  const [soldIds, setSoldIds] = useState<string[]>([]);
  const [credits, setCredits] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!accountId) return;
    const list = getShopEntries(accountId);
    setEntries(list);
    setSoldIds(getSoldIds());
    setCredits(getBalance());
    // Reflect any agent reprices on the catalog price.
    const map: Record<string, number> = {};
    for (const it of list) {
      const a = getAgentState(it.id);
      if (a) map[it.id] = a.priceCents;
    }
    setPrices(map);
  }, [accountId]);

  return (
    <PageShell
      eyebrow="Shop · second life"
      title="Buy something a second life"
      description="Every item is Amazon-graded and carries a Product Health Card — condition, authenticity, and impact verified. Not a classified; a trusted second life."
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/app/rewards"
          className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-brand transition-colors hover:bg-brand/20"
        >
          Your EcoCredits · {credits} →
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Earn more by choosing second-life over new
        </span>
      </div>

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
    </PageShell>
  );
}
