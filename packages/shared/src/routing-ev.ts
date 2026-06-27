// Smart Routing / Intelligent Bridge as expected-value optimization (Phase 3).
// "Logic decides, the model narrates" — unchanged. The decision is made in TWO
// deterministic, auditable layers:
//   1. HARD CONSTRAINTS (safety/legal) — an ordered, first-match ladder that can
//      force a path and is NEVER optimized away.
//   2. EV OPTIMIZATION — for the remaining viable paths, pick the one that maximizes
//      expected recovered value − cost − carbon penalty, using ML-predicted inputs
//      (clearing price × sell-through from P1/P2) and real freight/distance math.
// Every term is returned for on-screen explanation; pure + deterministic + reproducible.

import type { ReturnReason, ReturnRoutingDecision } from './return.js';

export type ReturnPath = ReturnRoutingDecision['decision'];

/** Compact, ML-/catalog-fed profile the engine reasons over. */
export interface RoutingEvProfile {
  // hard-constraint signals
  grade: 'A' | 'B' | 'C' | 'Salvage' | null;
  reason: ReturnReason;
  sellerType: '1P' | '3P';
  sellerOptedIn?: boolean; // 3P seller into ReLoop local routing
  authenticityMatch: boolean;
  functionallyVerifiable: boolean;
  reasonGradeMismatch?: boolean; // claims damaged but grades fine, etc. → fraud signal
  hazmat?: boolean; // battery/flammable/restricted → can't ship/resell normally
  restricted?: boolean;
  // economics (ML-fed: clearing price + freight)
  clearingPriceCents: number; // predicted resale clearing price (P2)
  localHandlingCents: number;
  nearbyBuyers: number;
  radiusKm: number;
  warehouseDistanceKm: number;
}

export interface EvTerm {
  label: string;
  /** Signed paise contribution to this path's EV (negative = cost). */
  valueCents: number;
}

export interface PathEv {
  path: ReturnPath;
  evCents: number;
  viable: boolean;
  terms: EvTerm[];
}

export interface RoutingEvResult {
  decision: ReturnPath;
  /** Set when a hard constraint forced the decision (skips EV). */
  hardRule?: string;
  /** EV breakdown for every path (for the glass-box screen). */
  evByPath: PathEv[];
  fallbackChain: ReturnPath[];
  dwellBudgetHours: number;
  co2SavedKg: number;
  localMarginCents: number;
  warehouseMarginCents: number;
  warehouseDistanceKm: number;
  nearbyBuyers: number;
  radiusKm: number;
}

// --- Tunable economics (documented; Location Service / carbon price in prod) ---
const CENTS_PER_KG_CO2 = 200; // ₹2/kg internal carbon price
const FREIGHT_COST_PER_KM_CENTS = 200; // ₹2/km road freight
const CO2_FREIGHT_PER_KM_KG = 0.004; // kg CO2e per km (≈2.3kg over 580km)
const CO2_LOCAL_KG = 0.2; // local handling footprint
const HIGH_VALUE_CENTS = 2_000_000; // ₹20,000 → fraud/verification gate

// Residual/cost model relative to the predicted clearing price.
const DONATION_VALUE_FRAC = 0.15; // social/tax credit residual
const RECYCLE_VALUE_FRAC = 0.08; // recovered materials
const WAREHOUSE_RECOVERY_FRAC = 0.6; // liquidation recovery at the FC

// Refurbishment only helps when there's condition to recover: a near-new item gains
// almost nothing, a worn one gains a lot. Cost rises with how much work it needs.
const REFURB_UPLIFT_BY_GRADE: Record<'A' | 'B' | 'C', number> = { A: 0.05, B: 0.18, C: 0.35 };
const REFURB_COST_BY_GRADE: Record<'A' | 'B' | 'C', number> = { A: 0.12, B: 0.2, C: 0.3 };

function refurbGrade(grade: RoutingEvProfile['grade']): 'A' | 'B' | 'C' {
  return grade === 'A' || grade === 'B' || grade === 'C' ? grade : 'C';
}

function sellThroughFor(nearbyBuyers: number): number {
  return Math.min(0.95, 0.4 + 0.07 * nearbyBuyers);
}

function carbonCostCents(kg: number): number {
  return Math.round(kg * CENTS_PER_KG_CO2);
}

/** The hard-constraint ladder. Returns a forced path + reason, or null to optimize. */
export function hardConstraint(p: RoutingEvProfile): { path: ReturnPath; rule: string } | null {
  if (p.sellerType === '3P' && !p.sellerOptedIn) {
    return { path: 'return_to_seller', rule: '3P seller not opted into local routing' };
  }
  if (p.reason === 'counterfeit' || p.reason === 'not_as_described') {
    return { path: 'return_to_seller', rule: `${p.reason} → seller policy` };
  }
  if (p.hazmat || p.restricted) {
    return { path: 'recycle', rule: 'hazmat/restricted → certified disposal only' };
  }
  if (p.reason === 'wrong_item') {
    return { path: 'warehouse', rule: 'wrong item → inventory reconciliation' };
  }
  if (!p.authenticityMatch) {
    return { path: 'warehouse', rule: 'authenticity mismatch → manual verification' };
  }
  if (p.clearingPriceCents >= HIGH_VALUE_CENTS && (p.reasonGradeMismatch || p.grade === null)) {
    return { path: 'warehouse', rule: 'high-value + unverified → fraud/verification gate' };
  }
  if (p.reasonGradeMismatch) {
    return { path: 'warehouse', rule: 'reason↔grade mismatch → fraud review' };
  }
  if (p.grade === 'Salvage' || p.grade === null) {
    return { path: 'recycle', rule: 'salvage/ungradeable → recycle' };
  }
  if (p.reason === 'arrived_damaged') {
    return { path: 'recycle', rule: 'arrived damaged → recycle' };
  }
  return null;
}

/** Compute the EV (and term breakdown) of every path for this profile. */
export function evByPath(p: RoutingEvProfile): PathEv[] {
  const stp = sellThroughFor(p.nearbyBuyers);
  const localCarbon = carbonCostCents(CO2_LOCAL_KG);
  const freightCost = Math.round(p.warehouseDistanceKm * FREIGHT_COST_PER_KM_CENTS);
  const freightCarbon = carbonCostCents(p.warehouseDistanceKm * CO2_FREIGHT_PER_KM_KG);

  const rg = refurbGrade(p.grade);
  const localResaleValue = Math.round(p.clearingPriceCents * stp);
  const refurbValue = Math.round(p.clearingPriceCents * (1 + REFURB_UPLIFT_BY_GRADE[rg]) * stp);
  const refurbCost = Math.round(p.clearingPriceCents * REFURB_COST_BY_GRADE[rg]);
  // Refurbish is only viable when there's condition to recover (worn grade) or the
  // item couldn't be functionally verified from photos (needs a bench check).
  const refurbViable = p.grade === 'B' || p.grade === 'C' || !p.functionallyVerifiable;
  const donationValue = Math.round(p.clearingPriceCents * DONATION_VALUE_FRAC);
  const recycleValue = Math.round(p.clearingPriceCents * RECYCLE_VALUE_FRAC);
  const warehouseRecovery = Math.round(p.clearingPriceCents * WAREHOUSE_RECOVERY_FRAC);

  const local: PathEv = {
    path: 'local_resale',
    viable: p.nearbyBuyers >= 1,
    evCents: localResaleValue - p.localHandlingCents - localCarbon,
    terms: [
      { label: `Resale × ${Math.round(stp * 100)}% sell-through`, valueCents: localResaleValue },
      { label: 'Local handling', valueCents: -p.localHandlingCents },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };
  const refurbish: PathEv = {
    path: 'refurbish',
    viable: refurbViable,
    evCents: refurbValue - refurbCost - p.localHandlingCents - localCarbon,
    terms: [
      { label: `Refurbished resale × ${Math.round(stp * 100)}%`, valueCents: refurbValue },
      { label: 'Refurb cost', valueCents: -refurbCost },
      { label: 'Local handling', valueCents: -p.localHandlingCents },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };
  const donate: PathEv = {
    path: 'donate',
    viable: true,
    evCents: donationValue - Math.round(p.localHandlingCents * 0.5) - localCarbon,
    terms: [
      { label: 'Donation credit', valueCents: donationValue },
      { label: 'Handling', valueCents: -Math.round(p.localHandlingCents * 0.5) },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };
  const recycle: PathEv = {
    path: 'recycle',
    viable: true,
    evCents: recycleValue - Math.round(p.localHandlingCents * 0.5) - localCarbon,
    terms: [
      { label: 'Recovered materials', valueCents: recycleValue },
      { label: 'Handling', valueCents: -Math.round(p.localHandlingCents * 0.5) },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };
  const warehouse: PathEv = {
    path: 'warehouse',
    viable: true,
    evCents: warehouseRecovery - freightCost - freightCarbon,
    terms: [
      { label: 'FC liquidation recovery', valueCents: warehouseRecovery },
      { label: `Freight ${p.warehouseDistanceKm}km`, valueCents: -freightCost },
      { label: 'Freight carbon', valueCents: -freightCarbon },
    ],
  };
  return [local, refurbish, donate, recycle, warehouse];
}

const DWELL: Partial<Record<ReturnPath, number>> = { local_resale: 48, refurbish: 72, donate: 96 };
const FALLBACKS: Record<ReturnPath, ReturnPath[]> = {
  local_resale: ['donate', 'recycle'],
  refurbish: ['local_resale', 'donate'],
  donate: ['recycle'],
  recycle: [],
  warehouse: [],
  return_to_seller: [],
};

/** Decide the route: hard ladder first, then argmax-EV over viable paths. */
export function decideRoute(p: RoutingEvProfile): RoutingEvResult {
  const paths = evByPath(p);
  const byPath = (path: ReturnPath): PathEv | undefined => paths.find((e) => e.path === path);
  const localEv = byPath('local_resale')?.evCents ?? 0;
  const warehouseEv = byPath('warehouse')?.evCents ?? 0;
  const freightCarbonKg = Math.round(p.warehouseDistanceKm * CO2_FREIGHT_PER_KM_KG * 10) / 10;

  const base = {
    evByPath: paths,
    warehouseDistanceKm: p.warehouseDistanceKm,
    nearbyBuyers: p.nearbyBuyers,
    radiusKm: p.radiusKm,
    localMarginCents: localEv,
    warehouseMarginCents: warehouseEv,
  };

  const forced = hardConstraint(p);
  if (forced) {
    const savesCarbon = forced.path === 'recycle' || forced.path === 'donate' || forced.path === 'return_to_seller';
    return {
      ...base,
      decision: forced.path,
      hardRule: forced.rule,
      fallbackChain: FALLBACKS[forced.path],
      dwellBudgetHours: DWELL[forced.path] ?? 0,
      // Avoiding the freight round-trip is the carbon saved when we stay local.
      co2SavedKg: savesCarbon ? freightCarbonKg : 0,
    };
  }

  // EV optimization over viable paths (argmax). Deterministic; ties broken by order.
  const viable = paths.filter((e) => e.viable);
  const best = viable.reduce((acc, e) => (e.evCents > acc.evCents ? e : acc));
  const co2SavedKg = best.path === 'warehouse' ? 0 : freightCarbonKg;

  return {
    ...base,
    decision: best.path,
    fallbackChain: FALLBACKS[best.path],
    dwellBudgetHours: DWELL[best.path] ?? 0,
    co2SavedKg,
  };
}
