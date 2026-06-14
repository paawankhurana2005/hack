// Listing Agent orchestration (demo, localStorage). Drives a simulated per-listing
// clock: each tick advances a day, accrues views + holding cost, runs the pure
// engine from @reloop/shared, applies the chosen lever, and appends to the feed.
// The engine decides; the API only narrates (with a deterministic fallback here).

import {
  decideAgentAction,
  estimateRouteImpact,
  simulateDailyViews,
  type AgentDecision,
  type AgentEvent,
  type ConditionGrade,
  type ImpactEstimate,
  type ItemCategory,
  type MarketContext,
  type RouteRecommendation,
} from '@reloop/shared';
import type { CasualListing, ListingStatus } from '@/mock/casual-listings';
import { formatMoney } from '@/lib/money';
import { narrateAgent } from '@/lib/api-client';
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

// --- The tick: one simulated day --------------------------------------------

/** Advance the agent one day. Returns the new state (or null if it can't run). */
export async function tick(id: string): Promise<AgentState | null> {
  const s = read(id);
  if (!s || !isAgentActive(s)) return s;

  s.day += 1;
  s.views += simulateDailyViews(s.priceCents, s.ctx);
  s.holdingCostAccruedCents += s.ctx.holdingCostPerDayCents;

  const decision = decideAgentAction({
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

  const now = new Date().toISOString();
  const acted = await narrate(s, decision);
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
    newEvents.push({ day: s.day, phase: 'diagnosed', text: decision.diagnosis, at: now, action: decision.action });
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
