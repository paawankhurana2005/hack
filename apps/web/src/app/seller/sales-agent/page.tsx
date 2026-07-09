'use client';

// Spec 024 — the Sales Agent: a portfolio-level batch driver over the
// existing per-listing Listing Agent. Reviews every listing a seller owns in
// one pass — reprices, widens reach, escalates dead stock, and un-escalates
// an escalated return-sourced item whose local geo-demand has genuinely
// improved — and explains itself.
//
// Spec 026 UI redesign: this page is now item-first. A seller picks ONE
// return — either still working through the Return Pipeline (read-only
// status here; no live pricing agent yet) or already dispatched to the
// Rescue Pipeline (local resale, has a real agent) — and watches that one
// item's agent run, with a rich log of every phase, factor, model call,
// price move, and notification. The whole-portfolio batch pass from spec 024
// still exists (some sellers want "just handle everything"), but it's now a
// secondary, collapsed tool rather than the page's primary purpose.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AgentAction, AgentEvent, SalesAgentDigest } from '@reloop/shared';
import { useRole } from '@/lib/role-context';
import {
  DEFAULT_SCHEDULE_INTERVAL_MS,
  getLastRunAt,
  markRunNow,
  runSalesAgent,
  runSalesAgentIfDue,
} from '@/lib/sales-agent';
import { LiveSimFeed } from '@/components/agent/live-sim-feed';
import { ActivityFeed } from '@/components/agent/activity-feed';
import { PriceHistoryStrip } from '@/components/agent/price-history-strip';
import { ModelTracePanel } from '@/components/pricing/model-trace-panel';
import { useItemAgentRunner } from '@/lib/use-item-agent-runner';
import { getSalesAgentItems, ROUTE_LABEL, STATUS_STYLE, type RescuePipelineItem } from '@/lib/sales-agent-items';
import { acceptRoute, isAgentActive } from '@/lib/agent-store';
import { matchBuyers } from '@/lib/demand-graph';
import { recordTransition } from '@/lib/mocks/return-store';
import { isSold } from '@/lib/marketplace-store';
import type { MatchedBuyer } from '@/lib/mocks/exchange-store';

const SCHEDULE_POLL_MS = 30_000; // how often we check "is a scheduled run due"

// Spec 026: the "watch it happen" demo mode — a much faster, visible cadence
// than the real "every 5 min" opt-in schedule above, with LLM narration on
// (narrateWithLlm: true) since this view is explicitly about explaining
// itself, not raw throughput.
const LIVE_SIM_TICK_MS = 2200;
const LIVE_SIM_STOP_AFTER_IDLE_TICKS = 2;

const ACTION_LABEL: Record<string, string> = {
  hold: 'Held',
  reprice: 'Repriced',
  widen_radius: 'Widened reach',
  improve_listing: 'Flagged listing',
  escalate_route: 'Escalated route',
  relist: 'Relisted',
};

const REASON_LABEL: Record<MatchedBuyer['matchReason'], string> = {
  searched: 'Searched for it',
  wishlisted: 'On their wish list',
  purchased_similar: 'Bought similar',
};

function inr(cents: number): string {
  return `₹${Math.round(cents / 100).toLocaleString('en-IN')}`;
}

export default function SalesAgentPage() {
  const { account, hydrated } = useRole();

  // --- Item list (spec 026) --------------------------------------------------
  const [returnPipeline, setReturnPipeline] = useState<ReturnType<typeof getSalesAgentItems>['returnPipeline']>([]);
  const [rescuePipeline, setRescuePipeline] = useState<RescuePipelineItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Opt-in technical trace view — real feature vector, bandit scores, raw
  // event JSON. Off by default so the normal seller experience is untouched;
  // flip it on for a pitch/demo walkthrough of what's actually happening.
  const [showTrace, setShowTrace] = useState(false);

  useEffect(() => {
    // Wait for the cloud→localStorage sync (role-context.tsx's hydrateBounded)
    // to land before reading return-store — otherwise a fresh session can
    // read a stale/empty snapshot the moment `account` resolves, before the
    // real synced data (shared across the seller's sessions) has arrived.
    if (!account?.id || !hydrated) return;
    const items = getSalesAgentItems(account.id);
    setReturnPipeline(items.returnPipeline);
    setRescuePipeline(items.rescuePipeline);
    if (!selectedId && items.rescuePipeline.length > 0) {
      setSelectedId(items.rescuePipeline[0]!.listing.id);
    }
    // Only re-run when the seller/hydration state changes — this page owns
    // its own list and refreshes it explicitly (see refreshItems below), not
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, hydrated]);

  function refreshItems() {
    if (!account?.id) return;
    const items = getSalesAgentItems(account.id);
    setReturnPipeline(items.returnPipeline);
    setRescuePipeline(items.rescuePipeline);
  }

  const selected = rescuePipeline.find((r) => r.listing.id === selectedId) ?? null;
  const selectedListing = selected?.listing ?? null;

  const runner = useItemAgentRunner(account?.id, selectedListing);
  const agent = runner.agentState;
  const sold = selectedListing ? isSold(selectedListing.id) : false;
  const active = agent ? isAgentActive(agent) && !sold : false;

  const notifiedKeys = new Set(
    runner.loggedEvents.flatMap((le, i) => (le.notified ? [`${le.event.day}-${i}`] : [])),
  );

  function handleAcceptRoute() {
    if (!selectedListing || !agent?.routeRecommendation) return;
    const res = acceptRoute(selectedListing.id);
    if (!res) return;
    runner.refreshAgentState();
    if (selectedListing.returnId) {
      recordTransition(selectedListing.returnId, {
        from: 'listed_local',
        to: res.state.status === 'recycled' ? 'recycle_batch' : 'donation_batch',
        at: new Date().toISOString(),
      });
    }
  }

  const buyers =
    selectedListing && agent
      ? matchBuyers({
          category: agent.category,
          priceCents: agent.priceCents,
          retailCents: agent.retailCents,
          radiusKm: agent.radiusKm,
          sku: undefined,
          storeProductId: selectedListing.storeProductId,
          excludeAccountId: selectedListing.sellerId,
        })
      : [];

  // --- Portfolio-wide batch pass (spec 024) — now a secondary tool ----------
  const [digest, setDigest] = useState<SalesAgentDigest | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(false);

  const [liveSim, setLiveSim] = useState(false);
  const [liveThinking, setLiveThinking] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [tickCount, setTickCount] = useState(0);
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([]);
  const [liveActionsByType, setLiveActionsByType] = useState<Partial<Record<AgentAction, number>>>({});
  const [liveResolvedCount, setLiveResolvedCount] = useState(0);
  const liveTicking = useRef(false);
  const idleTicksRef = useRef(0);

  async function handleRun() {
    if (!account?.id || running) return;
    setRunning(true);
    setRunError(null);
    try {
      const result = await runSalesAgent(account.id);
      setDigest(result);
      markRunNow(account.id);
      refreshItems();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Sales Agent run failed — try again.');
    } finally {
      setRunning(false);
    }
  }

  function startLiveSimulation() {
    setTickCount(0);
    setLiveEvents([]);
    setLiveActionsByType({});
    setLiveResolvedCount(0);
    setLiveError(null);
    idleTicksRef.current = 0;
    setLiveSim(true);
  }

  useEffect(() => {
    if (!liveSim || !account?.id) return;
    const sellerId = account.id;
    const timer = setTimeout(async () => {
      if (liveTicking.current) return;
      liveTicking.current = true;
      setLiveThinking(true);
      try {
        const result = await runSalesAgent(sellerId, { narrateWithLlm: true });
        setTickCount((n) => n + 1);
        setLiveEvents((prev) => [...prev, ...result.events]);
        setLiveActionsByType((prev) => {
          const merged = { ...prev };
          for (const [action, count] of Object.entries(result.actionsByType)) {
            merged[action as AgentAction] = (merged[action as AgentAction] ?? 0) + (count ?? 0);
          }
          return merged;
        });
        setLiveResolvedCount(
          (n) => n + (result.actionsByType.escalate_route ?? 0) + (result.actionsByType.relist ?? 0),
        );
        if (result.listingsReviewed === 0) {
          idleTicksRef.current += 1;
          if (idleTicksRef.current >= LIVE_SIM_STOP_AFTER_IDLE_TICKS) setLiveSim(false);
        } else {
          idleTicksRef.current = 0;
        }
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : 'Live simulation hit an error and stopped.');
        setLiveSim(false);
      } finally {
        liveTicking.current = false;
        setLiveThinking(false);
      }
    }, LIVE_SIM_TICK_MS);
    return () => clearTimeout(timer);
  }, [liveSim, account?.id, tickCount]);

  useEffect(() => {
    if (!scheduled || !account?.id) return;
    const id = account.id;
    const timer = setInterval(() => {
      void runSalesAgentIfDue(id, DEFAULT_SCHEDULE_INTERVAL_MS)
        .then((result) => {
          if (result) setDigest(result);
        })
        .catch(() => {
          // Unattended background poll — next tick will retry; no UI to surface to.
        });
    }, SCHEDULE_POLL_MS);
    return () => clearInterval(timer);
  }, [scheduled, account?.id]);

  const lastRunAt = account?.id ? getLastRunAt(account.id) : null;

  return(
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Sales Agent
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sales Agent</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Pick a return below and watch its agent work — reprice, widen reach, escalate, or relist 
      </p>

      <button
        type="button"
        onClick={() => setShowTrace((v) => !v)}
        className={`mt-4 rounded-full px-3 py-1 text-xs font-medium ring-1 ${
          showTrace ? 'bg-brand text-brand-foreground ring-brand' : 'bg-secondary ring-border'
        }`}
      >
        {showTrace ? 'Hide' : 'Show'} technical trace · real feature vectors, bandit scores, raw event log
      </button>

      {/* Primary layout: item list + selected item's live console */}
      <div className="mt-8 flex flex-wrap gap-6 lg:flex-nowrap">
        {/* Item list */}
        <div className="w-full shrink-0 space-y-6 lg:w-80">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-brand">
              Rescue pipeline · local resale · agent live
            </p>
            <div className="space-y-2">
              {rescuePipeline.map(({ listing, agent: preview }) => {
                const previewSold = isSold(listing.id);
                const status = previewSold ? 'sold' : (preview?.status ?? listing.status);
                return (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => setSelectedId(listing.id)}
                    className={`w-full rounded-xl p-3 text-left ring-1 transition-colors ${
                      listing.id === selectedId
                        ? 'bg-secondary ring-brand/50'
                        : 'bg-card ring-border hover:bg-secondary/50'
                    }`}
                  >
                    <p className="truncate text-sm font-semibold text-foreground">{listing.title}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {listing.returnId}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand">
                        {status}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        {inr(preview?.priceCents ?? listing.listedPrice.amountCents)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {rescuePipeline.length === 0 && (
                <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-border">
                  Nothing dispatched to local resale yet — approve a return below or from the Hub
                  Bench first.
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Return pipeline · not yet dispatched
            </p>
            <div className="space-y-2">
              {returnPipeline.map((r) => {
                const status = STATUS_STYLE[r.status];
                return (
                  <Link
                    key={r.returnId}
                    href={`/seller/returns/${r.returnId}`}
                    className="block rounded-xl bg-card p-3 ring-1 ring-border transition-colors hover:bg-secondary/50"
                  >
                    <p className="truncate text-sm font-semibold text-foreground">{r.productName}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {r.returnId}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${status.cls}`}>
                        {status.label}
                      </span>
                      {r.routingDecision && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {ROUTE_LABEL[r.routingDecision.decision]}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
              {returnPipeline.length === 0 && (
                <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-border">
                  Nothing waiting — every return has been dispatched.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Selected item's live console */}
        <div className="min-w-0 flex-1 space-y-4">
          {!selectedListing && (
            <div className="rounded-2xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-border">
              Select a Rescue pipeline item on the left to run its agent and watch the log.
            </div>
          )}

          {selectedListing && agent && (
            <>
              {/* Price + controls */}
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Day {agent.day} · current price
                    </p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums text-brand">{inr(agent.priceCents)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      comparable {inr(agent.ctx.comparableCents)} · {agent.ctx.localDemand} demand ·{' '}
                      {agent.views} views
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!active || runner.running || runner.autoSim}
                      onClick={() => void runner.runOnce()}
                      className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {runner.running ? 'Running…' : 'Run Agent'}
                    </button>
                    <button
                      type="button"
                      disabled={!active}
                      onClick={() => (runner.autoSim ? runner.stopAutoSim() : runner.startAutoSim())}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 ${
                        runner.autoSim ? 'bg-danger text-white' : 'bg-secondary text-foreground ring-1 ring-border'
                      }`}
                    >
                      {runner.autoSim ? 'Stop Auto Simulation' : 'Start Auto Simulation'}
                    </button>
                  </div>
                </div>

                {runner.error && (
                  <p className="mt-3 border-t border-border/60 pt-3 text-sm text-danger">{runner.error}</p>
                )}

                <div className="mt-3 border-t border-border/60 pt-3">
                  <PriceHistoryStrip history={agent.priceHistory} floorCents={agent.floorCents} />
                </div>
              </div>

              {/* Terminal banners */}
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

              {/* Matched buyers */}
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
                        <p className="truncate text-sm font-semibold text-foreground">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {REASON_LABEL[b.matchReason]} · {b.distanceKm}km away
                        </p>
                      </div>
                      <span className="font-mono text-sm tabular-nums text-brand">
                        {Math.round(b.matchScore * 100)}%
                      </span>
                    </li>
                  ))}
                  {buyers.length === 0 && (
                    <li className="py-2 text-sm text-muted-foreground">No matched buyers yet.</li>
                  )}
                </ul>
              </div>

              {/* Rich agent log */}
              <ActivityFeed
                events={runner.loggedEvents.map((le) => le.event)}
                thinking={runner.thinking}
                notifiedEventKeys={notifiedKeys}
                showTrace={showTrace}
              />

              {showTrace && agent.lastPricingDecision && (
                <ModelTracePanel decision={agent.lastPricingDecision} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Secondary — portfolio-wide batch tools (spec 024), collapsed by default */}
      <details className="mt-8 rounded-2xl bg-card ring-1 ring-border">
        <summary className="cursor-pointer select-none px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Portfolio-wide tools · review every listing you own in one pass
        </summary>
        <div className="border-t border-border/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                On-demand · reviews your whole portfolio
              </p>
              {digest && <p className="mt-1 text-sm text-foreground">{digest.narrative}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={scheduled}
                  onChange={(e) => setScheduled(e.target.checked)}
                  className="size-4 accent-brand"
                />
                Run automatically (every 5 min)
              </label>
              <button
                type="button"
                disabled={running || !account?.id}
                onClick={() => void handleRun()}
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {running ? 'Running…' : 'Run Sales Agent'}
              </button>
            </div>
          </div>
          {runError && <p className="mt-3 border-t border-border/60 pt-3 text-sm text-danger">{runError}</p>}
          {digest && (
            <ul className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
              {Object.entries(digest.actionsByType).map(([action, count]) => (
                <li
                  key={action}
                  className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground"
                >
                  {ACTION_LABEL[action] ?? action}
                  <span className="font-mono text-[10px] tabular-nums text-brand">{count}</span>
                </li>
              ))}
              {Object.keys(digest.actionsByType).length === 0 && (
                <li className="text-sm text-muted-foreground">Nothing needed attention.</li>
              )}
            </ul>
          )}
          {scheduled && (
            <p className="mt-3 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Scheduled — last ran{' '}
              {lastRunAt ? `${Math.round((Date.now() - lastRunAt) / 60_000)}m ago` : 'not yet'}. Listings you're
              actively driving manually (including via Auto Simulation above) are skipped automatically.
            </p>
          )}

          <div className="mt-4 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Live simulation · fast demo mode — ticks every ~2s while this page is open
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Watch the agent work through your whole portfolio, explaining each move as it happens.
                </p>
              </div>
              <button
                type="button"
                disabled={!account?.id}
                onClick={() => (liveSim ? setLiveSim(false) : startLiveSimulation())}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 ${
                  liveSim ? 'bg-danger text-white' : 'bg-brand text-brand-foreground'
                }`}
              >
                {liveSim ? 'Stop Live Simulation' : 'Start Live Simulation'}
              </button>
            </div>

            {liveError && <p className="mt-3 border-t border-border/60 pt-3 text-sm text-danger">{liveError}</p>}

            {(liveSim || tickCount > 0) && (
              <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Tick</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{tickCount}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Actions so far
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {Object.values(liveActionsByType).reduce((a, b) => a + (b ?? 0), 0)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Listings resolved
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{liveResolvedCount}</p>
                </div>
              </div>
            )}

            {(liveSim || liveEvents.length > 0) && (
              <div className="mt-4">
                <LiveSimFeed events={liveEvents} thinking={liveThinking} showTrace={showTrace} />
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
