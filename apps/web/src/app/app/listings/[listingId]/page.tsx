'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { estimateImpact, type ImpactEstimate } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PriceHistoryChart } from '@/components/agent/price-history-chart';
import { ActivityFeed } from '@/components/agent/activity-feed';
import { HealthCardHistory } from '@/components/sell/health-card-history';
import { GradedPhotos } from '@/components/listings/graded-photos';
import { formatMoney } from '@/lib/money';
import { findSeedListing } from '@/mock/seed-listings';
import type { CasualListing } from '@/mock/casual-listings';
import { getListings } from '@/lib/listings-store';
import { isSold } from '@/lib/marketplace-store';
import { getSale, type SellerSale } from '@/lib/sale-store';
import {
  acceptRoute,
  ensureAgent,
  isAgentActive,
  resetAgent,
  setManualPrice,
  setPaused,
  tick,
  type AgentState,
} from '@/lib/agent-store';

const inr = (cents: number) => ({ amountCents: cents, currency: 'INR' as const });
const TICK_MS = 1600;

function soldOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function resolveListing(id: string): CasualListing | undefined {
  return findSeedListing(id) ?? getListings().find((l) => l.id === id);
}

export default function ListingDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.listingId) ? params.listingId[0]! : (params.listingId as string);

  const [listing, setListing] = useState<CasualListing | null | undefined>(undefined);
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [routed, setRouted] = useState<ImpactEstimate | null>(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [sale, setSale] = useState<SellerSale | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const l = resolveListing(id);
    setListing(l ?? null);
    if (l) {
      const a = ensureAgent(l);
      // A Shop purchase of this listing flips it to Sold and stops the agent.
      if (isSold(l.id) && a.status !== 'sold') a.status = 'sold';
      setAgent(a);
      setPriceInput(String(Math.round(a.priceCents / 100)));
      if (a.status === 'sold') {
        const rec = getSale(l.id);
        if (rec) {
          setSale(rec);
        } else {
          // Derive a sale summary if the sale predates the sale-store.
          const imp = estimateImpact(a.category, { amountCents: a.priceCents, currency: 'INR' });
          setSale({
            id: l.id,
            title: l.title,
            soldPriceCents: a.priceCents,
            originalPriceCents: a.retailCents,
            sellerCredits: imp.ecoCredits,
            co2SavedKg: imp.co2SavedKg,
            soldAt: new Date().toISOString(),
          });
        }
      }
    }
  }, [id]);

  const advance = useCallback(async (auto = false) => {
    if (busy.current) return;
    busy.current = true;
    setThinking(true);
    // Auto-run uses the instant deterministic narration for a steady cadence;
    // a single manual "Advance 1 day" calls the LLM narrator.
    const next = await tick(id, { narrateWithLlm: !auto });
    if (next) {
      setAgent({ ...next });
      if (!isAgentActive(next)) setAutoRun(false);
    }
    setThinking(false);
    busy.current = false;
  }, [id]);

  // Auto-run: schedule the next tick once the previous settles.
  useEffect(() => {
    if (!autoRun || !agent || !isAgentActive(agent) || thinking) return;
    const t = setTimeout(() => void advance(true), TICK_MS);
    return () => clearTimeout(t);
  }, [autoRun, agent, thinking, advance]);

  if (listing === undefined) return <PageShell eyebrow="Second life" title="Listing" />;
  if (listing === null || !agent) {
    return (
      <PageShell eyebrow="Second life" title="Listing not found">
        <Card>
          <p className="text-sm text-muted-foreground">
            We couldn’t find that listing.{' '}
            <Link href="/app/listings" className="text-brand hover:underline">
              Back to My Listings
            </Link>
          </p>
        </Card>
      </PageShell>
    );
  }

  const routedDone = agent.status === 'recycled' || agent.status === 'donated';
  const sold = agent.status === 'sold';
  const active = isAgentActive(agent);
  const showRecycleBanner = !!agent.routeRecommendation && !routedDone && !dismissedBanner;
  const latest = agent.events[agent.events.length - 1];
  const reprices = agent.priceHistory.length - 1;

  const statusChip = sold
    ? { tone: 'success' as const, label: 'Sold' }
    : routedDone
      ? { tone: 'neutral' as const, label: agent.status === 'recycled' ? 'Recycled' : 'Donated' }
      : agent.routeRecommendation
        ? { tone: 'accent' as const, label: 'Recommending recycle' }
        : agent.paused
          ? { tone: 'neutral' as const, label: 'Agent paused' }
          : { tone: 'accent' as const, label: 'Agent active' };

  function onSetPrice() {
    const rupeesVal = Number(priceInput);
    if (!Number.isFinite(rupeesVal)) return;
    const next = setManualPrice(id, Math.round(rupeesVal * 100));
    if (next) {
      setAgent({ ...next });
      setAutoRun(false);
      setPriceInput(String(Math.round(next.priceCents / 100)));
    }
  }

  function onTogglePause() {
    const next = setPaused(id, !agent!.paused);
    if (next) setAgent({ ...next });
  }

  function onReset() {
    setAutoRun(false);
    const fresh = resetAgent(listing!);
    setAgent({ ...fresh });
    setRouted(null);
    setDismissedBanner(false);
    setPriceInput(String(Math.round(fresh.priceCents / 100)));
  }

  function onAccept() {
    const res = acceptRoute(id);
    if (res) {
      setAgent({ ...res.state });
      setRouted(res.impact);
      setAutoRun(false);
    }
  }

  return (
    <PageShell
      eyebrow="Second life · Listing Agent"
      title={listing.title}
      description="An autonomous agent watches this listing, diagnoses why it isn’t selling, and acts within hard price guardrails — narrating every move."
    >
      <Link
        href="/app/listings"
        className="mb-6 inline-block font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-brand"
      >
        ← My Listings
      </Link>

      {/* Sold payoff — the loop closed */}
      {sold && sale && (
        <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-b from-brand/15 to-card p-6 ring-1 ring-brand/40">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                Sold · loop closed
              </p>
              <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-brand [text-shadow:0_0_30px_rgba(234,179,8,0.3)]">
                Sold for {formatMoney(inr(sale.soldPriceCents))}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {reprices > 0
                  ? `Your agent made ${reprices} price ${reprices > 1 ? 'moves' : 'move'} to get it competitive — then it found a buyer.`
                  : 'It found a buyer.'}{' '}
                Sold {soldOn(sale.soldAt)}.
              </p>
            </div>
            <span className="grid size-12 animate-glow place-items-center rounded-full border-2 border-brand text-xl text-brand">
              ✓
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-background/60 p-4 text-center">
              <p className="text-2xl font-semibold tabular-nums text-brand">
                {formatMoney(inr(sale.soldPriceCents))}
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Payout to you
              </p>
            </div>
            <div className="rounded-xl bg-background/60 p-4 text-center">
              <p className="text-2xl font-semibold tabular-nums text-brand">+{sale.sellerCredits}</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                EcoCredits earned
              </p>
            </div>
            <div className="rounded-xl bg-background/60 p-4 text-center">
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {sale.co2SavedKg}
                <span className="text-sm text-muted-foreground">kg</span>
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                CO₂ saved
              </p>
            </div>
          </div>
          <Link
            href="/app/rewards"
            className="mt-4 inline-block font-mono text-[10px] uppercase tracking-widest text-brand hover:underline"
          >
            See your rewards →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="aspect-[4/3] overflow-hidden bg-background">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listing.imageUrl}
              alt={listing.title}
              className={`h-full w-full object-cover ${routedDone || sold ? 'opacity-50 grayscale' : ''}`}
            />
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Current price
              </span>
              <Badge tone={statusChip.tone}>{statusChip.label}</Badge>
            </div>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-brand">
              {formatMoney(inr(agent.priceCents))}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Floor {formatMoney(inr(agent.floorCents))}</span>
              <span className="text-right">Retail {formatMoney(inr(agent.retailCents))}</span>
              <span>Reach {agent.radiusKm}km</span>
              <span className="text-right">{agent.views} views</span>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <PriceHistoryChart
            history={agent.priceHistory}
            floorCents={agent.floorCents}
            retailCents={agent.retailCents}
            currentDay={agent.day}
            currentPriceCents={agent.priceCents}
          />

          {/* Current diagnosis */}
          {latest && (
            <Card className="ring-brand/20">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-brand">
                  Day {agent.day}
                </span>
                <p className="flex-1 text-sm text-foreground">{latest.text}</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Recycle recommendation banner */}
      {showRecycleBanner && (
        <Card className="mt-6 border-brand/40 bg-gradient-to-b from-brand/10 to-card ring-brand/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-brand text-lg">
                ♻️
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                  Agent recommendation
                </p>
                <p className="text-sm text-foreground">
                  Resale isn’t viable — the market sits below your floor and demand stays low even
                  city-wide. Recommend{' '}
                  <span className="font-semibold capitalize">{agent.routeRecommendation}</span> to
                  recover materials and EcoCredits instead of letting it sit.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={onAccept}>
                Accept · {agent.routeRecommendation === 'recycle' ? 'Recycle' : 'Donate'}
              </Button>
              <Button variant="ghost" onClick={() => setDismissedBanner(true)}>
                Keep trying
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Routed confirmation */}
      {routed && (
        <Card className="mt-6 ring-brand/40">
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            Routed · loop closed
          </p>
          <p className="mt-2 text-sm text-foreground">
            Recovered <span className="font-semibold text-brand">{routed.ecoCredits} EcoCredits</span>{' '}
            and avoided <span className="font-semibold">{routed.co2SavedKg}kg CO₂</span> to landfill.{' '}
            <Link href="/app/rewards" className="text-brand hover:underline">
              See your rewards →
            </Link>
          </p>
        </Card>
      )}

      {/* Controls + feed (controls hidden once the item has left the loop) */}
      <div className={`mt-6 grid gap-6 ${sold || routedDone ? '' : 'lg:grid-cols-[1fr_1.2fr]'}`}>
        {!(sold || routedDone) && (
        <div className="space-y-6">
          {/* Clock */}
          <Card>
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
              Simulated clock
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Each day is one agent cycle. Drive it manually or let it auto-run.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void advance()} disabled={!active || thinking}>
                Advance 1 day
              </Button>
              <Button
                variant="secondary"
                onClick={() => setAutoRun((v) => !v)}
                disabled={!active}
              >
                {autoRun ? 'Pause auto-run' : 'Auto-run'}
              </Button>
              <Button variant="ghost" onClick={onReset}>
                Reset
              </Button>
            </div>
            {!active && !routedDone && !sold && (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {agent.paused ? 'Agent paused — resume below to continue.' : 'Agent idle.'}
              </p>
            )}
          </Card>

          {/* Manual override */}
          <Card>
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                Manual override
              </p>
              <button
                type="button"
                onClick={onTogglePause}
                disabled={routedDone || sold}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-brand disabled:opacity-40"
              >
                {agent.paused ? 'Resume agent' : 'Pause agent'}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Take the wheel — set the price yourself. Stays within the {formatMoney(inr(agent.floorCents))}{' '}
              floor and {formatMoney(inr(agent.retailCents))} retail. This pauses the agent.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">₹</span>
              <input
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                disabled={routedDone || sold}
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-brand disabled:opacity-40"
              />
              <Button variant="secondary" onClick={onSetPrice} disabled={routedDone || sold}>
                Set price
              </Button>
            </div>
          </Card>
        </div>
        )}

        <ActivityFeed events={agent.events} thinking={thinking && !(sold || routedDone)} />
      </div>

      {/* As-graded photos — the seller's original condition uploads */}
      {listing.gradedPhotos && listing.gradedPhotos.length > 0 && (
        <div className="mt-6">
          <GradedPhotos
            photos={listing.gradedPhotos}
            title={listing.title}
            grade={listing.grade}
          />
        </div>
      )}

      {/* This item's lives — the multi-owner provenance lineage */}
      {listing.card && (
        <div className="mt-6">
          <HealthCardHistory
            card={listing.card}
            category={listing.category ?? 'other'}
            sellerName={listing.sellerName ?? 'Owner'}
          />
        </div>
      )}
    </PageShell>
  );
}
