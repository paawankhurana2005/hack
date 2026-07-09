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

// Pre-seeded returns — always visible on the seller dashboard
export const SEEDED_RETURNS: SubmittedReturn[] = [
  {
    returnId: 'RET-2026-800001',
    orderId: 'ORD-5501',
    productName: 'Fire HD 10 Tablet (32GB)',
    category: 'electronics',
    priceCents: 699900,
    reason: 'defective',
    photoCount: 3,
    submittedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    agentArrivesAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    status: 'pending_seller_approval',
    photoUrls: ['/catalog/fire-tablet.jpg'],
    gradingResult: {
      grade: 'A',
      confidence: 0.92,
      defects: ['Minor scratch on screen bezel'],
      authenticityMatch: true,
      wardrobingFlag: false,
      functionallyVerifiable: true,
      rawReason: 'defective',
    },
    routingDecision: {
      decision: 'local_resale',
      reasoning:
        'Amazon found 8 verified buyers within 4km who want this item. Local handling cost ₹380 vs ₹1,240 for a 580km warehouse round-trip — net saving ₹860. Item stays local; refund is unaffected.',
      co2SavedKg: 2.4,
      dwellBudgetHours: 48,
      sellerType: '1P',
      fallbackChain: ['donate', 'recycle'],
      nearbyBuyers: 8,
      radiusKm: 4,
      warehouseDistanceKm: 580,
      // Rupees, matching the live engine's convention (apps/api/src/lib/routing-engine.ts).
      warehouseMargin: -320,
      localMargin: 540,
    },
  },
  {
    returnId: 'RET-2026-800002',
    orderId: 'ORD-5502',
    productName: 'Echo Dot (5th Gen)',
    category: 'electronics',
    priceCents: 499900,
    reason: 'stopped_working',
    photoCount: 2,
    submittedAt: new Date(Date.now() - 26 * 3600000).toISOString(),
    agentArrivesAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    // Spec 026: still awaiting a seller dispatch decision (not local_resale,
    // so it was never routed through 'pending_seller_approval' — but the
    // seller's route picker needs a non-local_resale example to show on).
    status: 'awaiting_pickup',
    gradingResult: {
      grade: 'B',
      confidence: 0.84,
      defects: ['Cosmetic wear on base', 'Speaker mesh slightly dented'],
      authenticityMatch: true,
      wardrobingFlag: false,
      functionallyVerifiable: false,
      rawReason: 'stopped_working',
    },
    routingDecision: {
      decision: 'refurbish',
      reasoning:
        'Minor cosmetic wear detected. A certified refurbishment partner 3km away can restore resale value from ₹2,800 to ₹4,200 — net margin ₹1,400 vs a projected loss of ₹440 via warehouse return. Item will not travel 580km.',
      co2SavedKg: 1.2,
      dwellBudgetHours: 72,
      sellerType: '1P',
      fallbackChain: ['donate', 'recycle'],
      warehouseDistanceKm: 580,
      // Rupees, matching the live engine's convention.
      warehouseMargin: -440,
      localMargin: 1400,
      evBreakdown: {
        chosen: 'refurbish',
        paths: [
          {
            path: 'refurbish',
            evCents: 140000,
            viable: true,
            terms: [
              { label: 'Refurbished resale value uplift', valueCents: 180000 },
              { label: 'Repair cost', valueCents: -40000 },
            ],
          },
          {
            path: 'local_resale',
            evCents: 90000,
            viable: true,
            terms: [
              { label: 'Local buyer clearing price', valueCents: 110000 },
              { label: 'Local handling', valueCents: -20000 },
            ],
          },
          {
            path: 'donate',
            evCents: 15000,
            viable: true,
            terms: [
              { label: 'Donation value (flat)', valueCents: 20000 },
              { label: 'Handling', valueCents: -5000 },
            ],
          },
          {
            path: 'recycle',
            evCents: 8000,
            viable: true,
            terms: [
              { label: 'Recycling value (flat)', valueCents: 12000 },
              { label: 'Handling', valueCents: -4000 },
            ],
          },
          {
            path: 'warehouse',
            evCents: -44000,
            viable: true,
            terms: [
              { label: 'FC liquidation/restock mix', valueCents: 20000 },
              { label: 'Freight + dwell decay', valueCents: -64000 },
            ],
          },
        ],
      },
    },
  },
  {
    returnId: 'RET-2026-800003',
    orderId: 'ORD-5503',
    productName: 'Kindle Paperwhite (16GB)',
    category: 'electronics',
    priceCents: 149900,
    reason: 'changed_mind',
    photoCount: 4,
    submittedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    agentArrivesAt: new Date(Date.now() - 45 * 3600000).toISOString(),
    status: 'processed',
    gradingResult: {
      grade: 'C',
      confidence: 0.78,
      defects: ['Significant screen scratches', 'Cover damaged', 'Charging port loose'],
      authenticityMatch: true,
      wardrobingFlag: false,
      functionallyVerifiable: true,
      rawReason: 'changed_mind',
    },
    routingDecision: {
      decision: 'donate',
      reasoning:
        'Local resale margin after handling cost is ₹120 — below the ₹300 viability threshold. 2 verified NGO partners within 5km accept this category. Donating locally avoids 580km of freight and maximises social impact.',
      co2SavedKg: 0.8,
      dwellBudgetHours: 48,
      sellerType: '1P',
      fallbackChain: ['recycle'],
      warehouseDistanceKm: 580,
    },
  },
];

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
