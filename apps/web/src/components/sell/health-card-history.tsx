'use client';

import { useEffect, useState } from 'react';
import {
  cumulativeImpact,
  type ItemCategory,
  type ProductHealthCard,
  type ProvenanceChain,
  type ProvenanceEvent,
} from '@reloop/shared';
import { resolveChain } from '@/lib/provenance-store';
import { fetchChain, dataApiEnabled } from '@/lib/data-api';
import { formatMoney } from '@/lib/money';

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const GRADE_LABEL: Record<string, string> = {
  new: 'New',
  'like-new': 'Like New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

/** One row on the gold rail. `owned` events are rendered as ownership bands. */
function eventRow(e: ProvenanceEvent, key: string) {
  const stamp = e.verified ? (
    <span className="shrink-0 rounded-full border border-brand/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-brand">
      ✓ Amazon-verified
    </span>
  ) : (
    <span className="shrink-0 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
      unverified
    </span>
  );

  let title: string;
  let detail: string | null = null;
  switch (e.type) {
    case 'origin':
      title = `Sold new by ${e.seller}`;
      break;
    case 'graded':
      title = `Graded — ${GRADE_LABEL[e.grade] ?? e.grade} · ${Math.round(e.confidence * 100)}%`;
      detail =
        e.issues.length > 0
          ? e.issues.join(' · ')
          : e.referenceMatch
            ? 'Matches the original listing'
            : 'No issues found';
      break;
    case 'listed':
      title = `Listed for a second life · ${formatMoney(e.price)}`;
      break;
    case 'price_adjusted':
      title = `Price adjusted · ${formatMoney(e.fromPrice)} → ${formatMoney(e.toPrice)}`;
      detail = e.reason;
      break;
    case 'sold':
      title = `Sold to ${e.buyerName} · ${formatMoney(e.price)}`;
      detail = `+${e.co2SavedKg} kg CO₂ · +${e.ecoCredits} EcoCredits`;
      break;
    case 'routed':
      title = `Routed to ${e.route === 'recycle' ? 'recycling' : 'donation'}`;
      detail = `+${e.co2SavedKg} kg CO₂ · +${e.ecoCredits} EcoCredits`;
      break;
    default:
      title = '';
  }

  return (
    <li key={key} className="relative pl-6">
      <span className="absolute left-[3px] top-1.5 size-2 rounded-full bg-brand ring-2 ring-card" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">{title}</p>
          {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">{when(e.at)}</span>
          {stamp}
        </div>
      </div>
    </li>
  );
}

/** "This item's lives" — the multi-owner provenance lineage. Everything this
 *  physical object has ever been through, each step Amazon-verified. */
export function HealthCardHistory({
  card,
  category,
  sellerName,
}: {
  card: ProductHealthCard;
  category: ItemCategory;
  sellerName: string;
}) {
  const [chain, setChain] = useState<ProvenanceChain | null>(null);
  const [fromAws, setFromAws] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Local chain renders instantly (bulletproof); then prefer the DynamoDB ledger
    // if it has this item — so the trust history is genuinely served from AWS.
    const local = resolveChain(card, { category, sellerName });
    setChain(local);
    setFromAws(false);
    void fetchChain(card.itemId).then((remote) => {
      if (!cancelled && remote && remote.events.length >= local.events.length) {
        setChain(remote);
        setFromAws(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [card, category, sellerName]);

  if (!chain) return null;

  const impact = cumulativeImpact(chain);
  const lives = impact.lives; // number of owners (≥1)
  const hasSecondLife = lives >= 2;
  // Only origin/ownership recorded → be honest there's nothing more to show yet.
  const onlyOrigin = chain.events.every((e) => e.type === 'origin' || e.type === 'owned');

  return (
    <div className="rounded-[24px] border border-border bg-card p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            This item&apos;s lives
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Everything {chain.title} has been through
          </h3>
        </div>
        {dataApiEnabled && fromAws && (
          <span className="shrink-0 rounded-full border border-brand/30 bg-brand/5 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-brand">
            ● Live · DynamoDB
          </span>
        )}
      </div>

      {/* Cumulative beat — compounded across the whole life, derived not invented */}
      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-background/60 p-3">
          <p className="text-2xl font-semibold tabular-nums text-brand">{lives}</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {lives === 1 ? 'Life' : 'Lives'}
          </p>
        </div>
        <div className="rounded-xl bg-background/60 p-3">
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {impact.co2SavedKg}
            <span className="text-sm text-muted-foreground">kg</span>
          </p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            CO₂ avoided across its life
          </p>
        </div>
        <div className="rounded-xl bg-background/60 p-3">
          <p className="text-2xl font-semibold tabular-nums text-foreground">{impact.ecoCredits}</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            EcoCredits earned
          </p>
        </div>
      </div>

      {hasSecondLife && (
        <p className="mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-xs text-foreground">
          This object has already had a second life — and Amazon verified every handoff.
        </p>
      )}

      {/* The lineage on the gold rail */}
      <ol className="relative mt-6 space-y-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-border">
        {chain.events.map((e, i) => eventRow(e, `${e.type}-${i}`))}
      </ol>

      {onlyOrigin && (
        <p className="mt-4 text-xs text-muted-foreground">
          No verified second-life activity yet — its story starts here.
        </p>
      )}
    </div>
  );
}
