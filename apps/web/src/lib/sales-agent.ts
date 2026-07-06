// The Sales Agent (spec 024) — a portfolio-level batch driver over the
// existing per-listing Listing Agent. It never touches the bandit/
// reprice-engine directly: it reviews every listing a seller owns by calling
// the SAME ensureAgent()/tick() a seller already triggers by opening one
// listing and clicking through it, plus one new lever (`relist`) that only
// makes sense at the portfolio level.
//
// Phase 1 shipped strictly on-demand (a dashboard button) — a second
// autonomous timer would race each listing's own heartbeat cadence. Phase 5
// makes scheduled runs safe: `isManuallyLocked()` (agent-lock.ts) skips any
// listing whose own detail page is currently driving its clock (manual step
// or auto-run), so a background scheduled pass can never double-advance a
// listing the seller is watching. `runSalesAgentIfDue()` is the opt-in
// scheduled entry point; `runSalesAgent()` (unchanged) stays the on-demand one.

import type { AgentAction, AgentEvent, SalesAgentDigest } from '@reloop/shared';
import type { CasualListing } from '@/mock/casual-listings';
import { getListings } from '@/lib/listings-store';
import { seedListings } from '@/mock/seed-listings';
import {
  checkRelistCandidate,
  ensureAgent,
  isAgentActive,
  isRelistCandidate,
  relistFromRoute,
  tick,
  RELIST_DEMAND_MARGIN,
  type AgentState,
} from '@/lib/agent-store';
import { isManuallyLocked } from '@/lib/agent-lock';
import { createNotification } from '@/lib/api-client';

function sellerListings(sellerId: string): CasualListing[] {
  const all = [...getListings(), ...seedListings].filter((l) => l.sellerId === sellerId);
  const seen = new Set<string>();
  return all.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
}

/** Fire-and-forget — a notification failure must never break the Sales Agent
 *  run, matching the "never blocks the caller" ethos elsewhere in the app. */
function notify(sellerId: string, state: AgentState, event: AgentEvent): void {
  void createNotification({
    sellerId,
    kind: 'sales_agent',
    severity: event.action === 'escalate_route' ? 'warning' : 'info',
    title: `${state.title}: ${event.action ?? 'update'}`,
    body: event.text,
    listingId: state.id,
  }).catch(() => {});
}

/** Review every listing a seller owns and act where warranted. Deterministic
 *  and fast (no LLM per listing) — a single portfolio narration sentence is
 *  built from the aggregated counts afterward. */
export async function runSalesAgent(sellerId: string): Promise<SalesAgentDigest> {
  const listings = sellerListings(sellerId);
  const actionsByType: Partial<Record<AgentAction, number>> = {};
  const events: AgentEvent[] = [];
  let listingsReviewed = 0;

  function record(action: AgentAction, event: AgentEvent, state: AgentState): void {
    actionsByType[action] = (actionsByType[action] ?? 0) + 1;
    events.push(event);
    if (action !== 'hold') notify(sellerId, state, event);
  }

  for (const listing of listings) {
    if (isManuallyLocked(listing.id)) continue;
    const before = ensureAgent(listing);
    if (before.status === 'sold' || before.status === 'recycled' || before.status === 'donated') continue;
    listingsReviewed += 1;

    // Escalated listings are reviewed for a relist opportunity, not ticked.
    if (before.routeRecommendation) {
      if (!isRelistCandidate(before)) continue;
      const check = await checkRelistCandidate(before.id);
      if (!check || check.geoDemandIndex < (before.escalatedGeoDemandIndex ?? Infinity) * RELIST_DEMAND_MARGIN) {
        continue;
      }
      const relisted = relistFromRoute(before.id);
      const last = relisted?.events[relisted.events.length - 1];
      if (relisted && last) record('relist', last, relisted);
      continue;
    }

    if (!isAgentActive(before)) continue;

    const beforeLen = before.events.length;
    const after = await tick(before.id, { narrateWithLlm: false });
    if (!after) continue;
    const added = after.events.slice(beforeLen);
    const last = added[added.length - 1];
    if (last) record(last.action ?? 'hold', last, after);
  }

  const parts = Object.entries(actionsByType)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([action, count]) => `${action.replace('_', ' ')} ${count}`);
  const narrative =
    listingsReviewed === 0
      ? 'No active listings to review.'
      : `Reviewed ${listingsReviewed} listing${listingsReviewed === 1 ? '' : 's'}${
          parts.length ? `: ${parts.join(', ')}` : ' — everything is holding steady'
        }.`;

  return { ranAt: new Date().toISOString(), listingsReviewed, actionsByType, events, narrative };
}

// --- Phase 5: opt-in scheduled runs ------------------------------------------
// A demo stand-in for a real daily/hourly cadence — this whole system runs in
// the browser with localStorage state (Phase 1), so "scheduled" can only mean
// "runs periodically while the seller has the Sales Agent page open," not a
// true server-side cron. `lastRunAt` is still persisted, so the cadence is
// genuine across page reloads within a session, not just a component timer.
const LAST_RUN_KEY_PREFIX = 'reloop.salesAgent.lastRun.';
export const DEFAULT_SCHEDULE_INTERVAL_MS = 5 * 60 * 1000;

function lastRunKey(sellerId: string): string {
  return `${LAST_RUN_KEY_PREFIX}${sellerId}`;
}

export function getLastRunAt(sellerId: string): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(lastRunKey(sellerId));
  return raw ? Number(raw) : null;
}

export function markRunNow(sellerId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lastRunKey(sellerId), String(Date.now()));
  } catch {
    /* storage blocked — the schedule just won't persist across reloads */
  }
}

/** Run the Sales Agent only if `intervalMs` has elapsed since its last run
 *  (manual or scheduled) — the opt-in autonomous cadence. Returns `null`
 *  (not yet due) without touching any listing. */
export async function runSalesAgentIfDue(
  sellerId: string,
  intervalMs: number = DEFAULT_SCHEDULE_INTERVAL_MS,
): Promise<SalesAgentDigest | null> {
  const last = getLastRunAt(sellerId);
  if (last !== null && Date.now() - last < intervalMs) return null;
  const digest = await runSalesAgent(sellerId);
  markRunNow(sellerId);
  return digest;
}
