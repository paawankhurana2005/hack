'use client';

// Spec 026 UI redesign — the per-item counterpart to the Sales Agent page's
// portfolio-wide "Run Sales Agent" / Live Simulation. Drives ONE listing's
// clock via the same tick() a seller has always been able to trigger from
// Local Listings, but (a) also fires a notification per non-hold action —
// tick() itself never does, only the portfolio sweep in sales-agent.ts did,
// which meant a single-item run produced zero notifications until now — and
// (b) mirrors every event to devtools console.log so the whole orchestration
// story (model call, factors, price change, notification) is visible while
// recording a demo, not just on-screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '@reloop/shared';
import { ensureAgent, getAgentState, isAgentActive, tick, type AgentState } from '@/lib/agent-store';
import { acquireManualLock, releaseManualLock } from '@/lib/agent-lock';
import { notifyAgentEvent } from '@/lib/sales-agent';
import type { CasualListing } from '@/mock/casual-listings';

// Distinct constant from the portfolio page's LIVE_SIM_TICK_MS on purpose —
// same cadence today, but this loop's stop condition is per-item, not a
// portfolio-wide idle-tick heuristic, so it's worth keeping them separate.
const ITEM_LIVE_SIM_TICK_MS = 2200;

export interface LoggedAgentEvent {
  event: AgentEvent;
  /** True when this event triggered a real createNotification() call. */
  notified: boolean;
}

function inr(cents: number): string {
  return `₹${Math.round(cents / 100).toLocaleString('en-IN')}`;
}

function logToConsole(title: string, { event, notified }: LoggedAgentEvent): void {
  const actionLabel = event.action ? ` · ${event.action}` : '';
  console.groupCollapsed(
    `%c[Sales Agent] ${title} · Day ${event.day} · ${event.phase}${actionLabel}`,
    'color:#FF9900;font-weight:600;',
  );
  console.log(event.text);
  if (event.factors?.length) {
    console.log('factors:');
    console.table(event.factors);
  }
  if (event.priceFromCents !== undefined && event.priceToCents !== undefined) {
    const floor = event.floorCents !== undefined ? ` (floor ${inr(event.floorCents)})` : '';
    console.log(`price: ${inr(event.priceFromCents)} → ${inr(event.priceToCents)}${floor}`);
  }
  if (event.modelMeta) {
    console.log(
      event.modelMeta.usedFallback
        ? 'model: fallback narration (no live call this tick)'
        : `model: ${event.modelMeta.model} · ${event.modelMeta.latencyMs}ms · real call`,
    );
  }
  console.log(`notification pushed to seller: ${notified ? 'yes' : 'no'}`);
  console.groupEnd();
}

export function useItemAgentRunner(sellerId: string | undefined, listing: CasualListing | null) {
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [loggedEvents, setLoggedEvents] = useState<LoggedAgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [autoSim, setAutoSim] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickCount, setTickCount] = useState(0);
  const ticking = useRef(false);

  // Reset + (re)initialise whenever the selected item changes.
  useEffect(() => {
    setAutoSim(false);
    setError(null);
    setTickCount(0);
    if (!listing) {
      setAgentState(null);
      setLoggedEvents([]);
      return;
    }
    const state = ensureAgent(listing);
    setAgentState(state);
    // Prior history has no way to know whether a notification fired for it
    // (that plumbing starts now) — seed as unnotified rather than guessing.
    setLoggedEvents(state.events.map((event) => ({ event, notified: false })));
  }, [listing]);

  const applyTickResult = useCallback(
    (beforeLen: number, after: AgentState | null) => {
      if (!after) return;
      setAgentState(after);
      const newEvents = after.events.slice(beforeLen);
      if (newEvents.length === 0) return;
      const entries: LoggedAgentEvent[] = newEvents.map((event) => {
        const notified = !!event.action && event.action !== 'hold';
        if (notified && sellerId) notifyAgentEvent(sellerId, after, event, 'listing_agent');
        return { event, notified };
      });
      entries.forEach((entry) => logToConsole(after.title, entry));
      setLoggedEvents((prev) => [...prev, ...entries]);
    },
    [sellerId],
  );

  const runOnce = useCallback(async () => {
    if (!listing || ticking.current) return;
    ticking.current = true;
    setRunning(true);
    setThinking(true);
    setError(null);
    try {
      const before = ensureAgent(listing);
      const after = await tick(listing.id, { narrateWithLlm: true });
      applyTickResult(before.events.length, after);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent hit an error — try again.');
    } finally {
      ticking.current = false;
      setRunning(false);
      setThinking(false);
    }
  }, [listing, applyTickResult]);

  const startAutoSim = useCallback(() => setAutoSim(true), []);
  const stopAutoSim = useCallback(() => setAutoSim(false), []);

  /** Re-sync from storage after a mutation made outside this hook (e.g. the
   *  page calling acceptRoute() directly) — same escape hatch local-listings
   *  uses inline; kept here so the console doesn't need its own local copy
   *  of AgentState. */
  const refreshAgentState = useCallback(() => {
    if (!listing) return;
    setAgentState(getAgentState(listing.id));
  }, [listing]);

  // Auto Simulation loop — same setTimeout shape as the portfolio Live
  // Simulation on this page, scoped to one listing. Stops on a clean
  // per-item terminal condition (sold/recycled/donated/escalated/paused)
  // rather than the portfolio's idle-tick heuristic.
  useEffect(() => {
    if (!autoSim || !listing) return;
    if (agentState && !isAgentActive(agentState)) {
      setAutoSim(false);
      return;
    }
    const id = listing.id;
    const timer = setTimeout(async () => {
      if (ticking.current) return;
      ticking.current = true;
      setThinking(true);
      try {
        const before = ensureAgent(listing);
        const after = await tick(id, { narrateWithLlm: true });
        applyTickResult(before.events.length, after);
        setTickCount((n) => n + 1);
        if (after && !isAgentActive(after)) setAutoSim(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Auto simulation hit an error and stopped.');
        setAutoSim(false);
      } finally {
        ticking.current = false;
        setThinking(false);
      }
    }, ITEM_LIVE_SIM_TICK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSim, listing, tickCount]);

  // Manual lock: hold it for as long as Auto Simulation drives this item's
  // clock, so the portfolio "Run Sales Agent" pass can't double-tick it —
  // identical pattern to local-listings/page.tsx.
  useEffect(() => {
    if (!listing) return;
    if (autoSim) acquireManualLock(listing.id);
    return () => releaseManualLock(listing.id);
  }, [autoSim, listing]);

  return {
    agentState,
    running,
    autoSim,
    thinking,
    error,
    tickCount,
    loggedEvents,
    runOnce,
    startAutoSim,
    stopAutoSim,
    refreshAgentState,
  };
}
