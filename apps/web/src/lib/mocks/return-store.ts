import type {
  ReturnGradingResult,
  ReturnHealthCard,
  ReturnItemState,
  ReturnRoutingDecision,
  ReturnReason,
  ReturnStateTransition,
} from '@reloop/shared';

export interface SubmittedReturn {
  returnId: string;
  orderId: string;
  productName: string;
  category: string;
  priceCents: number;
  reason: ReturnReason;
  photoCount: number;
  photoUrls?: string[];
  gradingResult: ReturnGradingResult | null;
  routingDecision: ReturnRoutingDecision | null;
  /** Spec 022: the Product Health Card minted at grading time (real API or a
   *  deterministic-summary fallback). Absent on records from before this spec. */
  healthCard?: ReturnHealthCard | { fallback: true; summary: string };
  submittedAt: string;
  agentArrivesAt: string;
  status:
    | 'awaiting_pickup'
    | 'in_transit'
    | 'processed'
    | 'pending_seller_approval'
    | 'seller_approved'
    | 'deal_completed';
  sellerApprovedAt?: string;
  dealCompletedAt?: string;
  ecoCreditsAwarded?: number;
  // Spec 016: lifecycle state machine — absent on older records; treat a routed
  // decision as state 'routed' (see lifecycleOf).
  lifecycleState?: ReturnItemState;
  transitions?: ReturnStateTransition[];
  /** Catalog SKU of the returned item (drives demand-graph + open-box matching). */
  sku?: string;
  /** Set once the hub dispatched to local_resale and an agent listing was born. */
  listingId?: string;
  /** Spec 016.1: set once the hub staged this return into a liquidation lot. */
  lotId?: string;
}

/** Effective lifecycle state for records created before spec 016. */
export function lifecycleOf(r: SubmittedReturn): ReturnItemState {
  if (r.lifecycleState) return r.lifecycleState;
  return r.routingDecision ? 'routed' : 'initiated';
}

const STORAGE_KEY = 'reloop_returns_v1';

// Pre-seeded returns. Emptied for the demo: the seller returns queue is not
// scoped to a seller (see seller/returns/page.tsx), so these showed up in
// UrbanThread's queue too. Returns now come only from the buyer flow.
export const SEEDED_RETURNS: SubmittedReturn[] = [];

const SEEDED_IDS = new Set(SEEDED_RETURNS.map((r) => r.returnId));

/**
 * Merge a seeded demo return with its localStorage interaction state. Only
 * the fields an in-page action actually mutates (approve, mark-complete,
 * agent listing/lot linking, lifecycle transitions) come from localStorage —
 * everything else (grading, routing, pricing, product info) always comes
 * fresh from the current SEEDED_RETURNS source. Previously this took the
 * ENTIRE saved record once any interaction had happened, so a source fix to
 * a seed's numbers (or anything else) stayed permanently masked by whatever
 * was saved before the fix — exactly the bug that shipped the wrong
 * localMargin/warehouseMargin figures.
 */
function applySeedOverride(seed: SubmittedReturn, saved: SubmittedReturn): SubmittedReturn {
  return {
    ...seed,
    status: saved.status,
    sellerApprovedAt: saved.sellerApprovedAt ?? seed.sellerApprovedAt,
    dealCompletedAt: saved.dealCompletedAt ?? seed.dealCompletedAt,
    ecoCreditsAwarded: saved.ecoCreditsAwarded ?? seed.ecoCreditsAwarded,
    listingId: saved.listingId ?? seed.listingId,
    lotId: saved.lotId ?? seed.lotId,
    lifecycleState: saved.lifecycleState ?? seed.lifecycleState,
    transitions: saved.transitions ?? seed.transitions,
  };
}

export function getSubmittedReturns(): SubmittedReturn[] {
  if (typeof window === 'undefined') return SEEDED_RETURNS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: SubmittedReturn[] = raw ? (JSON.parse(raw) as SubmittedReturn[]) : [];
    // User-submitted returns
    const userReturns = saved.filter((r) => !SEEDED_IDS.has(r.returnId));
    // Seeded returns: only interaction state overrides from localStorage —
    // seed content itself always tracks the current source.
    const savedById = new Map(saved.map((r) => [r.returnId, r]));
    const seededWithOverrides = SEEDED_RETURNS.map((r) => {
      const override = savedById.get(r.returnId);
      return override ? applySeedOverride(r, override) : r;
    });
    return [...userReturns, ...seededWithOverrides];
  } catch {
    return SEEDED_RETURNS;
  }
}

export function getReturnById(returnId: string): SubmittedReturn | null {
  return getSubmittedReturns().find((r) => r.returnId === returnId) ?? null;
}

export function saveReturn(r: SubmittedReturn): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: SubmittedReturn[] = raw ? (JSON.parse(raw) as SubmittedReturn[]) : [];
    const idx = saved.findIndex((s) => s.returnId === r.returnId);
    if (idx >= 0) {
      saved[idx] = r;
    } else {
      saved.unshift(r);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // silently fail
  }
}

/**
 * Spec 016: record a checkpoint transition. Appends to the item's transition
 * log, advances the lifecycle state, and — when the checkpoint re-ran the
 * engine — replaces the routing decision with the re-evaluated one.
 */
export function recordTransition(
  returnId: string,
  transition: ReturnStateTransition,
): SubmittedReturn | null {
  const target = getReturnById(returnId);
  if (!target) return null;
  const updated: SubmittedReturn = {
    ...target,
    lifecycleState: transition.to,
    transitions: [...(target.transitions ?? []), transition],
    ...(transition.decision ? { routingDecision: transition.decision } : {}),
  };
  saveReturn(updated);
  return updated;
}

/**
 * Spec 026: the seller picks a different VIABLE route than the AI's
 * recommendation, straight from the EV breakdown already shown on the
 * returns queue — a real operational dispatch, not just a note. Reuses
 * `recordTransition()`'s mechanism (a self-loop into the new
 * `seller_route_choice` state, since nothing has physically moved yet).
 * `local_resale` and `warehouse` already have their own richer handlers
 * (`handleApprove()`/`handleSendToWarehouse()` in `SellerReturnDetail.tsx`)
 * — this covers the remaining routes (refurbish/donate/recycle/liquidate/
 * restock/return_to_seller/returnless_refund), marking the return
 * `processed` once dispatched, matching the status the pre-seeded demo
 * returns for those routes already use.
 */
export function applySellerRouteChoice(
  returnId: string,
  newDecision: ReturnRoutingDecision,
  note: string,
): SubmittedReturn | null {
  const target = getReturnById(returnId);
  if (!target) return null;
  const transitioned = recordTransition(returnId, {
    from: target.lifecycleState ?? 'routed',
    to: 'seller_route_choice',
    at: new Date().toISOString(),
    evidence: { source: 'hub_bench', notes: note },
    decision: newDecision,
  });
  if (!transitioned) return null;
  const updated: SubmittedReturn = { ...transitioned, status: 'processed' };
  saveReturn(updated);
  return updated;
}

/** Spec 016: link the agent listing born at hub dispatch back to its return. */
export function linkListing(returnId: string, listingId: string): SubmittedReturn | null {
  const target = getReturnById(returnId);
  if (!target) return null;
  const updated: SubmittedReturn = { ...target, listingId };
  saveReturn(updated);
  return updated;
}

/** Spec 016.1: link the hub liquidation lot this return was staged into. */
export function linkLot(returnId: string, lotId: string): SubmittedReturn | null {
  const target = getReturnById(returnId);
  if (!target) return null;
  const updated: SubmittedReturn = { ...target, lotId };
  saveReturn(updated);
  return updated;
}

export function generateReturnId(): string {
  return `RET-2026-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function approveReturn(returnId: string): SubmittedReturn | null {
  const all = getSubmittedReturns();
  const target = all.find((r) => r.returnId === returnId);
  if (!target) return null;
  const updated: SubmittedReturn = {
    ...target,
    status: 'seller_approved',
    sellerApprovedAt: new Date().toISOString(),
  };
  saveReturn(updated);
  return updated;
}

export function completeDeal(returnId: string, ecoCredits: number): SubmittedReturn | null {
  const all = getSubmittedReturns();
  const target = all.find((r) => r.returnId === returnId);
  if (!target) return null;
  const updated: SubmittedReturn = {
    ...target,
    status: 'deal_completed',
    dealCompletedAt: new Date().toISOString(),
    ecoCreditsAwarded: ecoCredits,
  };
  saveReturn(updated);
  return updated;
}
