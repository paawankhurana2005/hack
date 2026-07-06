'use client';

// Spec 016 Stage 7 — Local Listings: the autonomous executor at work. Every item
// the hub dispatched to local resale gets a Listing Agent: it watches the demand
// graph, reprices through the spec-014 engine (deterministic fallback offline),
// and when local resale stops beating "route elsewhere" it escalates back to the
// Bridge — donate/recycle — closing the return's lifecycle either way.

import { useEffect, useRef, useState } from 'react';
import {
  acceptRoute,
  applyManualMarkdown,
  ensureAgent,
  getAgentState,
  isAgentActive,
  tick,
  type AgentState,
} from '@/lib/agent-store';
import { getReturnListings } from '@/lib/return-market';
import { matchBuyers } from '@/lib/demand-graph';
import { recordTransition } from '@/lib/mocks/return-store';
import { isSold } from '@/lib/marketplace-store';
import type { CasualListing } from '@/mock/casual-listings';
import type { MatchedBuyer } from '@/lib/mocks/exchange-store';

const AUTO_TICK_MS = 1600;

function inr(paise: number) {
  return `₹${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;
}

const REASON_LABEL: Record<MatchedBuyer['matchReason'], string> = {
  searched: 'Searched for it',
  wishlisted: 'On their wish list',
  purchased_similar: 'Bought similar',
};

export default function LocalListingsPage() {
  const [listings, setListings] = useState<CasualListing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [markdownInput, setMarkdownInput] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const all = getReturnListings();
    setListings(all);
    if (all.length > 0) setSelectedId(all[0]!.id);
  }, []);

  const selected = listings.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    setAutoRun(false);
    setMarkdownInput('');
    if (!selected) {
      setAgent(null);
      return;
    }
    setAgent(ensureAgent(selected));
  }, [selected]);

  const sold = selected ? isSold(selected.id) : false;
  const active = agent ? isAgentActive(agent) && !sold : false;

  async function advance(auto: boolean) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const next = await tick(selected.id, { narrateWithLlm: !auto });
      if (next) setAgent({ ...next });
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkdown() {
    if (!selected || busy) return;
    const rupees = Number(markdownInput);
    if (!Number.isFinite(rupees) || rupees <= 0) return;
    setBusy(true);
    try {
      const next = await applyManualMarkdown(selected.id, Math.round(rupees * 100));
      if (next) setAgent({ ...next });
      setMarkdownInput('');
    } finally {
      setBusy(false);
    }
  }

  // Auto-run: a steady beat of simulated days until the agent stops being active.
  useEffect(() => {
    if (!autoRun) return;
    if (!agent || !isAgentActive(agent) || sold) {
      setAutoRun(false);
      return;
    }
    timer.current = setTimeout(() => void advance(true), AUTO_TICK_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, agent]);

  function handleAcceptRoute() {
    if (!selected) return;
    const res = acceptRoute(selected.id);
    if (!res) return;
    setAgent({ ...res.state });
    // Close the return's lifecycle through the same state machine the hub uses.
    if (selected.returnId) {
      recordTransition(selected.returnId, {
        from: 'listed_local',
        to: res.state.status === 'recycled' ? 'recycle_batch' : 'donation_batch',
        at: new Date().toISOString(),
      });
    }
  }

  const buyers =
    selected && agent
      ? matchBuyers({
          category: agent.category,
          priceCents: agent.priceCents,
          retailCents: agent.retailCents,
          radiusKm: agent.radiusKm,
          sku: undefined,
          storeProductId: selected.storeProductId,
          excludeAccountId: selected.sellerId,
        })
      : [];

  const lastEvents = agent ? agent.events.slice(-8).reverse() : [];

  return (
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Local Listings
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Local listings — agent-run
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Every return dispatched to local resale gets an autonomous agent: it watches local demand,
        reprices with the dynamic-pricing engine, and hands the item back to the Bridge when resale
        stops beating the route-elsewhere value. You can always take the wheel.
      </p>

      <div className="mt-8 flex gap-6">
        {/* Queue */}
        <div className="w-72 shrink-0 space-y-2">
          {listings.map((l) => {
            const a = getAgentState(l.id);
            const st = isSold(l.id) ? 'sold' : (a?.status ?? l.status);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedId(l.id)}
                className={`w-full rounded-xl p-3 text-left ring-1 transition-colors ${
                  l.id === selectedId
                    ? 'bg-secondary ring-brand/50'
                    : 'bg-card ring-border hover:bg-secondary/50'
                }`}
              >
                <p className="truncate text-sm font-semibold text-foreground">{l.title}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {l.returnId}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand">
                    {st}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-foreground">
                    {inr(a?.priceCents ?? l.listedPrice.amountCents)}
                  </span>
                </div>
              </button>
            );
          })}
          {listings.length === 0 && (
            <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-border">
              Nothing here yet — dispatch a return to local resale from the Hub Bench first.
            </p>
          )}
        </div>

        {/* Agent panel */}
        {selected && agent && (
          <div className="min-w-0 flex-1 space-y-4">
            {/* Price + controls */}
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Day {agent.day} · current price
                  </p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-brand">
                    {inr(agent.priceCents)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    floor {inr(agent.floorCents)} (route-elsewhere value) · comparable{' '}
                    {inr(agent.ctx.comparableCents)} · {agent.ctx.localDemand} demand ·{' '}
                    {agent.views} views
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!active || busy}
                    onClick={() => void advance(false)}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Advance 1 day
                  </button>
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => setAutoRun((v) => !v)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors disabled:opacity-40 ${
                      autoRun
                        ? 'bg-warning/20 text-warning ring-warning/40'
                        : 'bg-secondary text-foreground ring-border hover:text-brand'
                    }`}
                  >
                    {autoRun ? 'Stop auto-run' : 'Auto-run'}
                  </button>
                </div>
              </div>

              {/* Seller-approved markdown — a deliberate override, distinct from the
                  agent's own reprice loop; lands in one step and raises the floor. */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Approve a markdown (₹)
                </span>
                <input
                  type="number"
                  min={1}
                  inputMode="decimal"
                  value={markdownInput}
                  onChange={(e) => setMarkdownInput(e.target.value)}
                  placeholder={`e.g. ${Math.round(agent.floorCents / 100)}`}
                  className="w-28 rounded-full bg-secondary px-3 py-1 text-sm text-foreground ring-1 ring-border focus:outline-none focus:ring-brand/50"
                />
                <button
                  type="button"
                  disabled={!active || busy || !markdownInput}
                  onClick={() => void handleMarkdown()}
                  className="rounded-full bg-secondary px-4 py-1.5 text-sm font-semibold text-foreground ring-1 ring-border transition-colors hover:text-brand disabled:opacity-40"
                >
                  Set price
                </button>
              </div>

              {/* Price history strip */}
              <div className="mt-3 flex flex-wrap items-center gap-1">
                {agent.priceHistory.map((p, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground">→</span>}
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                      d{p.day} {inr(p.cents)}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Sold / routed terminal banners */}
            {(sold || agent.status === 'sold') && (
              <div className="rounded-2xl bg-success/10 p-4 ring-1 ring-success/30">
                <p className="font-mono text-[10px] uppercase tracking-widest text-success">
                  Sold · delivered to a local buyer
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The return's lifecycle is closed: listed → sold → delivered, never a linehaul.
                </p>
              </div>
            )}
            {(agent.status === 'recycled' || agent.status === 'donated') && (
              <div className="rounded-2xl bg-success/10 p-4 ring-1 ring-success/30">
                <p className="font-mono text-[10px] uppercase tracking-widest text-success">
                  {agent.status === 'recycled' ? 'Recycled' : 'Donated'} · cascaded by the agent
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Local resale stopped beating the route-elsewhere value, so the agent handed the
                  item back to the Bridge instead of letting it rot on a shelf.
                </p>
              </div>
            )}

            {/* Escalation banner */}
            {agent.routeRecommendation && agent.status !== 'recycled' && agent.status !== 'donated' && (
              <div className="rounded-2xl bg-warning/10 p-4 ring-1 ring-warning/40">
                <p className="font-mono text-[10px] uppercase tracking-widest text-warning">
                  Agent recommendation · escalate route
                </p>
                <p className="mt-1 text-sm text-foreground">
                  Resale isn't viable at the {inr(agent.floorCents)} floor — recommend{' '}
                  <span className="font-semibold">{agent.routeRecommendation}</span>.
                </p>
                <button
                  type="button"
                  onClick={handleAcceptRoute}
                  className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                >
                  Accept · {agent.routeRecommendation === 'recycle' ? 'Recycle' : 'Donate'}
                </button>
              </div>
            )}

            {/* Matched buyers — the demand graph speaking */}
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Matched buyers · additive layer on Amazon's recommendation signals
              </p>
              <ul className="mt-2 divide-y divide-border">
                {buyers.slice(0, 5).map((b) => (
                  <li key={b.buyerId} className="flex items-center gap-3 py-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[10px] text-foreground">
                      {b.avatar}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {b.name}
                        {b.buyerId.startsWith('user_') && (
                          <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand">
                            live account
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {REASON_LABEL[b.matchReason]} · {b.distanceKm}km away
                      </p>
                    </div>
                    <span className="font-mono text-sm tabular-nums text-brand">
                      {Math.round(b.matchScore * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Activity feed */}
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Agent activity
              </p>
              <ul className="mt-2 space-y-2">
                {lastEvents.map((e, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      d{e.day}
                    </span>
                    <span className="text-muted-foreground">{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
