// Listing Agent orchestration (demo, localStorage). Drives a simulated per-listing
// clock: each tick advances a day, accrues views + holding cost, runs the pure
// engine from @reloop/shared, applies the chosen lever, and appends to the feed.
// The engine decides; the API only narrates (with a deterministic fallback here).

import {
  decideAgentAction,
  estimateRouteImpact,
  isSignificant,
  simulateDailyViews,
  type AgentDecision,
  type AgentEvent,
  type ConditionGrade,
  type DemandEvent,
  type DemandEventType,
  type ImpactEstimate,
  type ItemCategory,
  type MarketContext,
  type PricingDecision,
  type RouteRecommendation,
} from '@reloop/shared';
import type { CasualListing, ListingStatus } from '@/mock/casual-listings';
import { formatMoney } from '@/lib/money';
import { decidePricing, narrateAgent, type PricingDecideRequest } from '@/lib/api-client';
import { earnSeller } from '@/lib/credits-store';
import { appendEventIfStored } from '@/lib/provenance-store';

const keyFor = (id: string): string => `reloop.agent.${id}`;

export interface AgentState {
  id: string;
  /** The physical item this listing is for — key into its provenance chain. */
  itemId: string;
  title: string;
  listedPriceCents: number;
  listedAt: string;
  day: number;
  priceCents: number;
  floorCents: number;
  retailCents: number;
  grade: ConditionGrade;
  category: ItemCategory;
  radiusKm: number;
  views: number;
  offers: number;
  holdingCostAccruedCents: number;
  hasImproved: boolean;
  priceHistory: { day: number; cents: number }[];
  events: AgentEvent[];
  paused: boolean;
  status: ListingStatus;
  routeRecommendation?: RouteRecommendation;
  ctx: MarketContext;
  /** Last day the agent actually ran a pricing decision (for the heartbeat cadence). */
  lastRepriceDay?: number;
}

const inr = (cents: number) => ({ amountCents: cents, currency: 'INR' as const });

function read(id: string): AgentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(id));
    return raw ? (JSON.parse(raw) as AgentState) : null;
  } catch {
    return null;
  }
}

function write(s: AgentState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(s.id), JSON.stringify(s));
  } catch {
    /* storage blocked — session only */
  }
}

function deriveContext(listing: CasualListing): MarketContext {
  if (listing.market) return listing.market;
  const price = listing.listedPrice.amountCents;
  return {
    comparableCents: Math.round(price * 0.9),
    localDemand: 'medium',
    holdingCostPerDayCents: Math.max(2000, Math.round(price * 0.01)),
    baseViewsPerDay: 6,
  };
}

function buildInitial(listing: CasualListing): AgentState {
  const price = listing.listedPrice.amountCents;
  const floor = listing.floorCents ?? Math.round(price * 0.5);
  const retail = listing.retailCents ?? Math.round(price / 0.55);
  return {
    id: listing.id,
    itemId: listing.itemId ?? listing.id,
    title: listing.title,
    listedPriceCents: price,
    listedAt: listing.listedAt,
    day: 0,
    priceCents: price,
    floorCents: floor,
    retailCents: retail,
    grade: listing.grade ?? 'good',
    category: listing.category ?? 'other',
    radiusKm: 4,
    views: 0,
    offers: 0,
    holdingCostAccruedCents: 0,
    hasImproved: false,
    priceHistory: [{ day: 0, cents: price }],
    events: [
      {
        day: 0,
        phase: 'acted',
        text: `Listed at ${formatMoney(inr(price))} within a 4km radius. Agent is watching the market.`,
        at: listing.listedAt,
      },
    ],
    paused: false,
    status: listing.status === 'listed' ? 'listed' : listing.status,
    ctx: deriveContext(listing),
    lastRepriceDay: 0,
  };
}

/** Get existing agent state, initialising it from the listing on first access. */
export function ensureAgent(listing: CasualListing): AgentState {
  const existing = read(listing.id);
  if (existing) return existing;
  const fresh = buildInitial(listing);
  write(fresh);
  return fresh;
}

export function getAgentState(id: string): AgentState | null {
  return read(id);
}

const ACTIVE: ListingStatus[] = ['listed', 'viewed', 'matched'];
export function isAgentActive(s: AgentState): boolean {
  return !s.paused && ACTIVE.includes(s.status) && !s.routeRecommendation;
}

// --- Narration (LLM with deterministic fallback) -----------------------------

function fallbackNarration(s: AgentState, d: AgentDecision): string {
  switch (d.action) {
    case 'reprice':
      return `I lowered the price from ${formatMoney(inr(s.priceCents))} to ${formatMoney(
        inr(d.newPriceCents ?? s.priceCents),
      )} to close the gap to the ${formatMoney(inr(s.ctx.comparableCents))} comparable — still above the ${formatMoney(
        inr(s.floorCents),
      )} floor.`;
    case 'widen_radius':
      return `Price is competitive, so I widened the match radius to ${d.newRadiusKm}km to find demand beyond the neighbourhood.`;
    case 'improve_listing':
      return `Plenty of views but no offers — I flagged the listing for stronger photos or detail.`;
    case 'escalate_route':
      return `Resale isn't viable at the ${formatMoney(
        inr(s.floorCents),
      )} floor, so I recommend ${d.routeRecommendation === 'recycle' ? 'recycling' : 'donating'} it to recover value and avoid landfill.`;
    default:
      return d.diagnosis;
  }
}

async function narrate(s: AgentState, d: AgentDecision): Promise<string> {
  try {
    const { text } = await narrateAgent({
      action: d.action,
      diagnosis: d.diagnosis,
      priceFromCents: s.priceCents,
      priceToCents: d.newPriceCents,
      floorCents: s.floorCents,
      comparableCents: s.ctx.comparableCents,
      demand: s.ctx.localDemand,
      radiusKm: d.newRadiusKm ?? s.radiusKm,
      routeRecommendation: d.routeRecommendation,
      day: s.day,
      title: s.title,
    });
    return text.trim() || fallbackNarration(s, d);
  } catch {
    return fallbackNarration(s, d);
  }
}

// --- Spec-014 dynamic-pricing engine as the price brain ----------------------
// Each tick asks the dynamic reprice engine (/api/pricing/decide) for the next price:
// XGBoost (or the deterministic fallback model) predicts reward per arm, a Thompson
// bandit picks one, guardrails clamp it. Its floor→reroute signal becomes the recycle
// escalation. Returns an AgentDecision the existing tick machinery already knows how to
// apply — or null if the API is unreachable, so tick() falls back to the local engine.

// Heartbeat cadence: when nothing significant happens, the agent still re-checks the
// price only every few days (the staleness backstop) — NOT every day. Events can trigger
// a reprice sooner.
const HEARTBEAT_DAYS = 3;

// Deterministic per-(listing, day) RNG so the same day always yields the same market
// event — stable across re-renders and reproducible after a Reset.
function dayRandom(id: string, day: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let a = (h ^ Math.imul(day + 1, 2654435761)) >>> 0;
  a = Math.imul(a ^ (a >>> 15), 1 | a);
  a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

/** Simulate the day's candidate market event. Most days produce a quiet `heartbeat`
 *  (insignificant on its own); occasionally a real event the filter will let through. */
function simulateDayEvent(s: AgentState, viewsToday: number): DemandEvent {
  const now = new Date().toISOString();
  const base = (type: DemandEventType, payload: Record<string, unknown>): DemandEvent => ({
    type,
    listingId: s.id,
    timestamp: now,
    payload,
  });
  if ([3, 7, 14, 21].includes(s.day)) return base('dwell_threshold', { daysOnMarket: s.day });
  const r = dayRandom(s.id, s.day);
  const comparable = Math.round(s.ctx.comparableCents / 100);
  if (r < 0.1) return base('comp_listed', { price: Math.round(comparable * (0.85 + r)) }); // undercuts
  if (r < 0.16) return base('comp_sold', {});
  if (r < 0.26) return base('view_velocity_drop', { currentVelocity: viewsToday });
  return base('heartbeat', { daysOnMarket: s.day });
}

async function decideViaEngine(
  s: AgentState,
  event: DemandEvent,
): Promise<{ decision: AgentDecision; acted: string } | null> {
  const anchor = Math.round(s.ctx.comparableCents / 100);
  const floor = Math.round(s.floorCents / 100);
  const req: PricingDecideRequest = {
    listingId: s.id,
    currentPrice: Math.round(s.priceCents / 100),
    event: { type: event.type, payload: event.payload },
    state: {
      category: s.category,
      gradeKey: s.grade,
      compMedianPrice: anchor,
      amazonNewPrice: Math.round(s.retailCents / 100),
      sellerFloor: floor,
      routeElsewhereValue: Math.round(floor * 0.6), // salvage < floor, so floor governs
      numReprices: s.priceHistory.length - 1,
      daysOnMarket: s.day,
      viewVelocity24h: Math.max(1, Math.round(s.views / Math.max(1, s.day))),
      compMinPrice: Math.round(anchor * 0.85),
    },
  };

  let pd: PricingDecision;
  try {
    pd = await decidePricing(req);
  } catch {
    return null; // API down → caller uses the local deterministic engine
  }

  const anchorCents = Math.round(pd.anchorPrice * 100);
  const marginCents = Math.round(pd.expectedMargin * 100);
  const firedRules = pd.guardrailsApplied.filter((g) => g.triggered).map((g) => g.rule);
  const factors = [
    { label: 'Local median', value: formatMoney(inr(anchorCents)) },
    { label: 'Chosen lever', value: `${pd.chosenArm}× median` },
    { label: 'Expected margin', value: formatMoney(inr(marginCents)) },
    ...(firedRules.length ? [{ label: 'Guardrails', value: firedRules.join(', ') }] : []),
  ];

  // Floor hit → the market sits below what we can sustainably sell for → recycle.
  if (firedRules.includes('hard_floor')) {
    const acted = `The market sits below your ${formatMoney(
      inr(s.floorCents),
    )} floor — resale isn't viable, so I recommend recycling to recover value instead of letting it sit.`;
    return {
      decision: { action: 'escalate_route', routeRecommendation: 'recycle', diagnosis: pd.reason, factors, confidence: 0.9 },
      acted,
    };
  }

  const finalCents = Math.round(pd.finalPrice * 100);
  const diagnosis = `Reward model favoured ${pd.chosenArm}× the ${formatMoney(
    inr(anchorCents),
  )} local median (expected margin ${formatMoney(inr(marginCents))}).`;
  if (finalCents !== s.priceCents) {
    // Narrate the REAL move (the agent knows from→to); the engine supplied the "why".
    const verb = finalCents < s.priceCents ? 'Lowered' : 'Raised';
    const capped = firedRules.includes('max_step_change') ? ' (capped to one step)' : '';
    const acted = `${verb} from ${formatMoney(inr(s.priceCents))} to ${formatMoney(
      inr(finalCents),
    )}${capped} — the reward model picked ${pd.chosenArm}× the ${formatMoney(
      inr(anchorCents),
    )} local median, still clear of the ${formatMoney(inr(s.floorCents))} floor.`;
    return { decision: { action: 'reprice', newPriceCents: finalCents, diagnosis, factors, confidence: 0.85 }, acted };
  }
  const acted = `Holding at ${formatMoney(
    inr(s.priceCents),
  )} — that's already where the reward model wants it for this market.`;
  return { decision: { action: 'hold', diagnosis, factors, confidence: 0.7 }, acted };
}

// --- The tick: one simulated day --------------------------------------------

/**
 * Advance the agent one day. Returns the new state (or null if it can't run).
 *
 * `narrateWithLlm` (default true) controls how the day's line is written:
 * - true  → call the LLM narrator (nice for a single manual step).
 * - false → use the instant, deterministic narration. Auto-run uses this so the
 *   cadence is a steady beat instead of jittering on variable network latency.
 */
export async function tick(
  id: string,
  { narrateWithLlm = true }: { narrateWithLlm?: boolean } = {},
): Promise<AgentState | null> {
  const s = read(id);
  if (!s || !isAgentActive(s)) return s;

  s.day += 1;
  const viewsToday = simulateDailyViews(s.priceCents, s.ctx);
  s.views += viewsToday;
  s.holdingCostAccruedCents += s.ctx.holdingCostPerDayCents;

  const now = new Date().toISOString();

  // --- Trigger gate: reprice ONLY on a significant event or the heartbeat cadence ------
  // Most days the agent just watches and holds — it does not touch the price daily. This
  // is the same filter the API uses (shared @reloop/shared), so web + server agree.
  const event = simulateDayEvent(s, viewsToday);
  const filterCtx = {
    compMedianPrice: Math.round(s.ctx.comparableCents / 100),
    amazonNewPrice: Math.round(s.retailCents / 100),
    viewVelocity24h: Math.max(1, s.ctx.baseViewsPerDay),
  };
  const significantEvent = event.type !== 'heartbeat' && isSignificant(event, filterCtx);
  const heartbeatDue = s.day - (s.lastRepriceDay ?? 0) >= HEARTBEAT_DAYS;

  if (!significantEvent && !heartbeatDue) {
    // HOLD — watch the market, accrue views, log the reasoning, leave the price alone.
    s.events = [
      ...s.events,
      {
        day: s.day,
        phase: 'acted',
        action: 'hold',
        text: `Watching — ${viewsToday} ${viewsToday === 1 ? 'view' : 'views'} today, comparable ${formatMoney(
          inr(s.ctx.comparableCents),
        )}, no significant change. Holding at ${formatMoney(inr(s.priceCents))}.`,
        at: now,
      },
    ];
    write(s);
    return s;
  }

  // A reason to act → run the price brain (engine), or the local fallback if the API is down.
  const triggerEvent: DemandEvent = significantEvent
    ? event
    : { ...event, type: 'heartbeat' };
  s.lastRepriceDay = s.day;
  const viaEngine = await decideViaEngine(s, triggerEvent);
  let decision: AgentDecision;
  let acted: string;
  if (viaEngine) {
    decision = viaEngine.decision;
    acted = viaEngine.acted;
  } else {
    decision = decideAgentAction({
      day: s.day,
      priceCents: s.priceCents,
      floorCents: s.floorCents,
      retailCents: s.retailCents,
      grade: s.grade,
      category: s.category,
      views: s.views,
      offers: s.offers,
      radiusKm: s.radiusKm,
      holdingCostAccruedCents: s.holdingCostAccruedCents,
      hasImproved: s.hasImproved,
      ctx: s.ctx,
    });
    acted = narrateWithLlm ? await narrate(s, decision) : fallbackNarration(s, decision);
  }
  const priceFrom = s.priceCents;

  // Apply the chosen lever.
  if (decision.action === 'reprice' && decision.newPriceCents !== undefined) {
    s.priceCents = decision.newPriceCents;
    s.priceHistory = [...s.priceHistory, { day: s.day, cents: s.priceCents }];
    // Provenance: one summarised entry per real price change (not per tick).
    if (s.priceCents !== priceFrom) {
      appendEventIfStored(s.itemId, {
        type: 'price_adjusted',
        at: now,
        verified: true,
        fromPrice: inr(priceFrom),
        toPrice: inr(s.priceCents),
        reason: decision.diagnosis,
      });
    }
  } else if (decision.action === 'widen_radius' && decision.newRadiusKm !== undefined) {
    s.radiusKm = decision.newRadiusKm;
  } else if (decision.action === 'improve_listing') {
    s.hasImproved = true;
  } else if (decision.action === 'escalate_route') {
    s.routeRecommendation = decision.routeRecommendation;
  }

  const newEvents: AgentEvent[] = [];
  if (decision.action === 'hold') {
    newEvents.push({ day: s.day, phase: 'acted', text: acted, at: now, action: 'hold' });
  } else {
    newEvents.push({
      day: s.day,
      phase: 'perceived',
      text: `${s.views} views · ${s.offers} offers · comparable ${formatMoney(
        inr(s.ctx.comparableCents),
      )} · ${s.ctx.localDemand} demand`,
      at: now,
    });
    newEvents.push({
      day: s.day,
      phase: 'diagnosed',
      text: decision.diagnosis,
      at: now,
      action: decision.action,
      factors: decision.factors,
    });
    newEvents.push({
      day: s.day,
      phase: 'acted',
      text: acted,
      at: now,
      action: decision.action,
      priceFromCents: decision.action === 'reprice' ? priceFrom : undefined,
      priceToCents: decision.action === 'reprice' ? s.priceCents : undefined,
      floorCents: decision.action === 'reprice' ? s.floorCents : undefined,
      routeRecommendation: decision.routeRecommendation,
    });
  }

  s.events = [...s.events, ...newEvents];
  write(s);
  return s;
}

// --- User controls -----------------------------------------------------------

/** Manual override (idea #1): set the price within rails, pause the agent, log it. */
export function setManualPrice(id: string, cents: number): AgentState | null {
  const s = read(id);
  if (!s) return null;
  const clamped = Math.min(s.retailCents, Math.max(s.floorCents, Math.round(cents)));
  const from = s.priceCents;
  s.priceCents = clamped;
  s.priceHistory = [...s.priceHistory, { day: s.day, cents: clamped }];
  s.paused = true;
  if (clamped !== from) {
    appendEventIfStored(s.itemId, {
      type: 'price_adjusted',
      at: new Date().toISOString(),
      verified: true,
      fromPrice: inr(from),
      toPrice: inr(clamped),
      reason: 'Owner set the price manually.',
    });
  }
  s.events = [
    ...s.events,
    {
      day: s.day,
      phase: 'acted',
      text: `You set the price from ${formatMoney(inr(from))} to ${formatMoney(
        inr(clamped),
      )} — manual override. Agent paused.`,
      at: new Date().toISOString(),
      action: 'reprice',
      priceFromCents: from,
      priceToCents: clamped,
      floorCents: s.floorCents,
    },
  ];
  write(s);
  return s;
}

/**
 * Spec 023: seller approves a specific discounted price for an already-listed
 * item (distinct from `setManualPrice`, which is a pure client-side clamp that
 * pauses the agent). This goes through the real reprice engine as a
 * `seller_markdown` event — the bandit/model still run for telemetry
 * continuity, the seller's price becomes the new floor going forward, and the
 * agent keeps running (the bandit continues adjusting from this new baseline).
 */
export async function applyManualMarkdown(
  id: string,
  approvedPriceCents: number,
): Promise<AgentState | null> {
  const s = read(id);
  if (!s) return null;

  const approvedPrice = Math.round(approvedPriceCents / 100);
  const newFloorCents = Math.max(s.floorCents, approvedPriceCents);
  const anchor = Math.round(s.ctx.comparableCents / 100);
  const from = s.priceCents;
  const now = new Date().toISOString();

  const req: PricingDecideRequest = {
    listingId: s.id,
    currentPrice: Math.round(s.priceCents / 100),
    event: { type: 'seller_markdown', payload: { approvedPrice } },
    state: {
      category: s.category,
      gradeKey: s.grade,
      compMedianPrice: anchor,
      amazonNewPrice: Math.round(s.retailCents / 100),
      sellerFloor: Math.round(newFloorCents / 100),
      routeElsewhereValue: Math.round((newFloorCents / 100) * 0.6),
      numReprices: s.priceHistory.length - 1,
      daysOnMarket: s.day,
    },
  };

  let finalCents: number;
  let diagnosis: string;
  try {
    const pd = await decidePricing(req);
    finalCents = Math.round(pd.finalPrice * 100);
    diagnosis = pd.reason;
  } catch {
    // Engine unreachable — fall back to the approved price itself, clamped to
    // the retail ceiling, so the seller's action still lands.
    finalCents = Math.min(s.retailCents, approvedPriceCents);
    diagnosis = 'Set from your approved markdown (pricing engine unavailable, applied directly).';
  }

  s.priceCents = finalCents;
  s.floorCents = newFloorCents;
  s.priceHistory = [...s.priceHistory, { day: s.day, cents: finalCents }];

  if (finalCents !== from) {
    appendEventIfStored(s.itemId, {
      type: 'price_adjusted',
      at: now,
      verified: true,
      fromPrice: inr(from),
      toPrice: inr(finalCents),
      reason: 'Seller-approved markdown.',
    });
  }

  s.events = [
    ...s.events,
    {
      day: s.day,
      phase: 'diagnosed',
      text: diagnosis,
      at: now,
      action: 'reprice',
    },
    {
      day: s.day,
      phase: 'acted',
      text: `Seller approved a markdown from ${formatMoney(inr(from))} to ${formatMoney(
        inr(finalCents),
      )} — new floor ${formatMoney(inr(newFloorCents))}.`,
      at: now,
      action: 'reprice',
      priceFromCents: from,
      priceToCents: finalCents,
      floorCents: newFloorCents,
    },
  ];
  write(s);
  return s;
}

export function setPaused(id: string, paused: boolean): AgentState | null {
  const s = read(id);
  if (!s) return null;
  s.paused = paused;
  s.events = [
    ...s.events,
    {
      day: s.day,
      phase: 'acted',
      text: paused ? 'Agent paused — you have the wheel.' : 'Agent resumed — back to watching the market.',
      at: new Date().toISOString(),
    },
  ];
  write(s);
  return s;
}

/** Accept the agent's route recommendation: mark routed + award materials credits. */
export function acceptRoute(id: string): { state: AgentState; impact: ImpactEstimate } | null {
  const s = read(id);
  if (!s || !s.routeRecommendation) return null;
  const route = s.routeRecommendation;
  const impact = estimateRouteImpact(s.category, route);
  s.status = route === 'recycle' ? 'recycled' : 'donated';
  s.events = [
    ...s.events,
    {
      day: s.day,
      phase: 'acted',
      text: `${route === 'recycle' ? 'Recycled' : 'Donated'} — recovered ${impact.ecoCredits} EcoCredits and avoided ${impact.co2SavedKg}kg CO₂ to landfill.`,
      at: new Date().toISOString(),
      action: 'escalate_route',
      routeRecommendation: route,
    },
  ];
  write(s);
  earnSeller(impact.ecoCredits, `${route === 'recycle' ? 'Recycled' : 'Donated'} ${s.title}`);
  return { state: s, impact };
}

/** Spec 016: a buyer bought the listing — the agent's job is done. */
export function markAgentSold(id: string, salePriceCents?: number): AgentState | null {
  const s = read(id);
  if (!s || s.status === 'sold') return s;
  s.status = 'sold';
  s.events = [
    ...s.events,
    {
      day: s.day,
      phase: 'acted',
      text: `Sold at ${formatMoney(inr(salePriceCents ?? s.priceCents))} — a matched local buyer completed the purchase. Agent retired.`,
      at: new Date().toISOString(),
    },
  ];
  write(s);
  return s;
}

export function resetAgent(listing: CasualListing): AgentState {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(keyFor(listing.id));
    } catch {
      /* ignore */
    }
  }
  const fresh = buildInitial(listing);
  write(fresh);
  return fresh;
}
