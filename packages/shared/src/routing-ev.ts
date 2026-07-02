// Smart Routing / Intelligent Bridge as expected-value optimization (Phase 3).
// "Logic decides, the model narrates" — unchanged. The decision is made in TWO
// deterministic, auditable layers:
//   1. HARD CONSTRAINTS (safety/legal) — an ordered, first-match ladder that can
//      force a path and is NEVER optimized away.
//   2. EV OPTIMIZATION — for the remaining viable paths, pick the one that maximizes
//      expected recovered value − cost − carbon penalty, using ML-predicted inputs
//      (clearing price × sell-through from P1/P2) and real freight/distance math.
// Every term is returned for on-screen explanation; pure + deterministic + reproducible.

import type { Grade, GradePosterior, ReturnReason, ReturnRoutingDecision } from './return.js';
import type { ItemCategory } from './sell.js';

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
  // --- Spec 016: decision-under-uncertainty inputs (all optional — legacy
  // callers that omit them get byte-identical behavior to the point-grade engine).
  /** Grading confidence 0–1; gates route eligibility (θ_r per path). */
  confidence?: number;
  /** Full grade distribution; discounts recovery when mass sits below the modal grade. */
  gradePosterior?: GradePosterior;
  /** Category keys the price-decay curve (`decay(t_r)` — time is a P&L line). */
  category?: ItemCategory;
  /** Factory seal verified — gates the restock path. */
  sealed?: boolean;
  /** SKU still live in the catalog with healthy sell-through — gates restock. */
  skuActive?: boolean;
  /** Nearest FC inbound distance (restock leg); defaults to warehouseDistanceKm. */
  nearestFcKm?: number;
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
  /** Spec 016: why the path was gated out (e.g. confidence below the route's θ). */
  gateReason?: string;
}

export interface RoutingEvResult {
  decision: ReturnPath;
  /** Set when a hard constraint forced the decision (skips EV). */
  hardRule?: string;
  /** EV breakdown for every path (for the glass-box screen). */
  evByPath: PathEv[];
  fallbackChain: ReturnPath[];
  dwellBudgetHours: number;
  /** Spec 016: decision TTL — re-evaluated at the next checkpoint or on expiry. */
  ttlHours: number;
  co2SavedKg: number;
  localMarginCents: number;
  warehouseMarginCents: number;
  warehouseDistanceKm: number;
  nearbyBuyers: number;
  radiusKm: number;
}

// --- Tunable economics (documented; Location Service / carbon price in prod) ---
// Exported so downstream carbon accounting (carbon-vouchers.ts) reuses this exact
// internal carbon price instead of inventing a second, disagreeing one.
export const CENTS_PER_KG_CO2 = 200; // ₹2/kg internal carbon price
const FREIGHT_COST_PER_KM_CENTS = 200; // ₹2/km road freight
const CO2_FREIGHT_PER_KM_KG = 0.004; // kg CO2e per km (≈2.3kg over 580km)
export const CO2_LOCAL_KG = 0.2; // local handling footprint
const HIGH_VALUE_CENTS = 2_000_000; // ₹20,000 → fraud/verification gate

// Residual/cost model relative to the predicted clearing price.
const DONATION_VALUE_FRAC = 0.15; // social/tax credit residual
const RECYCLE_VALUE_FRAC = 0.08; // recovered materials
const WAREHOUSE_RECOVERY_FRAC = 0.6; // liquidation recovery at the FC

// Refurbishment only helps when there's condition to recover: a near-new item gains
// almost nothing, a worn one gains a lot. Cost rises with how much work it needs.
const REFURB_UPLIFT_BY_GRADE: Record<'A' | 'B' | 'C', number> = { A: 0.05, B: 0.18, C: 0.35 };
const REFURB_COST_BY_GRADE: Record<'A' | 'B' | 'C', number> = { A: 0.12, B: 0.2, C: 0.3 };

// --- Spec 016: restock, time decay, and confidence gates ------------------------
// Restock = straight to the nearest FC inbound dock as sellable, deleting the
// returns-center hop entirely. Recovery is near-full price (sold before markdown)
// minus a receive+shelve touch.
const RESTOCK_RECOVERY_FRAC = 0.92;
const RESTOCK_HANDLING_CENTS = 15_000; // FC inbound receive + shelve (₹150)
const RESTOCK_REASONS: ReadonlySet<ReturnReason> = new Set(['changed_mind', 'didnt_fit', 'duplicate_gift']);

// decay(t_r): each path has an expected time-to-cash; category-specific weekly
// price decay makes the engine SEE that weeks of returns-center dwell are a real
// P&L line. This is the mathematical heart of "decide before it moves".
const TIME_TO_CASH_DAYS: Record<ReturnPath, number> = {
  restock: 4,
  local_resale: 3,
  refurbish: 8,
  donate: 2,
  recycle: 2,
  warehouse: 21,
  return_to_seller: 0,
};
const WEEKLY_DECAY_BY_CATEGORY: Record<ItemCategory, number> = {
  electronics: 0.02,
  fashion: 0.015,
  home: 0.008,
  sports: 0.01,
  toys: 0.01,
  books: 0.005,
  other: 0.01,
};

// Confidence gates θ_r — DERIVED from correction cost, not arbitrary: a bad unit
// reaching a buyer as "new" costs a second return plus trust (θ_restock high);
// a mis-donated item costs almost nothing (θ_donate low). recycle/warehouse are
// never gated, so the eligible set can only collapse TOWARD today's flow —
// graceful degradation with no special-case code path.
const CONFIDENCE_GATE: Partial<Record<ReturnPath, number>> = {
  restock: 0.85,
  local_resale: 0.6,
  refurbish: 0.5,
  donate: 0.3,
};

// Grade-sensitive recovery: how much of the modal-grade clearing price each grade
// actually realizes. Used to discount recovery when the posterior spreads below
// the modal grade (restock/local/refurb are grade-sensitive; donation, recycling
// and FC liquidation recoveries are already conservative fractions).
const GRADE_VALUE_FRAC: Record<Grade, number> = { A: 1.0, B: 0.85, C: 0.65, Salvage: 0.2 };

/**
 * Lift a point grade + calibrated confidence into a posterior: the modal grade
 * keeps the confidence mass, the remainder spreads to adjacent grades.
 */
export function posteriorFromPointGrade(grade: Grade, confidence: number): GradePosterior {
  const order: Grade[] = ['A', 'B', 'C', 'Salvage'];
  const c = Math.min(0.999, Math.max(0.05, confidence));
  const post: GradePosterior = { A: 0, B: 0, C: 0, Salvage: 0 };
  post[grade] = c;
  const i = order.indexOf(grade);
  const neighbors = [order[i - 1], order[i + 1]].filter((g): g is Grade => g !== undefined);
  for (const n of neighbors) post[n] = (1 - c) / neighbors.length;
  return post;
}

/** Expected grade-value factor relative to the modal grade (degenerate posterior → 1). */
function gradeMixFactor(posterior: GradePosterior | undefined): number {
  if (!posterior) return 1;
  const grades: Grade[] = ['A', 'B', 'C', 'Salvage'];
  let total = 0;
  let expected = 0;
  let modal: Grade = 'A';
  for (const g of grades) {
    const w = posterior[g] ?? 0;
    total += w;
    expected += w * GRADE_VALUE_FRAC[g];
    if (w > (posterior[modal] ?? 0)) modal = g;
  }
  if (total <= 0) return 1;
  return expected / total / GRADE_VALUE_FRAC[modal];
}

/** Multiplicative value retention after the path's expected time-to-cash. */
function decayFactor(category: ItemCategory | undefined, path: ReturnPath): number {
  if (!category) return 1;
  const weekly = WEEKLY_DECAY_BY_CATEGORY[category];
  return Math.pow(1 - weekly, TIME_TO_CASH_DAYS[path] / 7);
}

// How long a decision stays valid before the next checkpoint must re-evaluate.
// Demand-sensitive paths expire fastest.
const TTL_HOURS: Record<ReturnPath, number> = {
  local_resale: 12,
  restock: 24,
  refurbish: 24,
  donate: 48,
  recycle: 72,
  warehouse: 72,
  return_to_seller: 72,
};

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
  const mix = gradeMixFactor(p.gradePosterior);

  // Recovery with the spec-016 uncertainty + time adjustments surfaced as their own
  // signed terms (glass-box: the screen shows WHY a path lost value, not just that
  // it did). Both no-op when the optional inputs are absent — legacy callers get
  // byte-identical terms.
  const recovered = (
    path: ReturnPath,
    label: string,
    baseCents: number,
    gradeSensitive: boolean,
  ): { terms: EvTerm[]; totalCents: number } => {
    const terms: EvTerm[] = [{ label, valueCents: baseCents }];
    let value = baseCents;
    if (gradeSensitive && mix !== 1) {
      const adj = Math.round(baseCents * (mix - 1));
      if (adj !== 0) {
        terms.push({ label: 'Grade uncertainty discount', valueCents: adj });
        value += adj;
      }
    }
    const d = decayFactor(p.category, path);
    if (d !== 1) {
      const adj = Math.round(value * (d - 1));
      if (adj !== 0) {
        terms.push({ label: `Value decay (${TIME_TO_CASH_DAYS[path]}d to cash)`, valueCents: adj });
        value += adj;
      }
    }
    return { terms, totalCents: value };
  };

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

  // Restock: nearest FC inbound, not the returns center. Only meaningful when the
  // seal + catalog signals are present; without them it is simply not viable.
  const fcKm = p.nearestFcKm ?? p.warehouseDistanceKm;
  const fcFreight = Math.round(fcKm * FREIGHT_COST_PER_KM_CENTS);
  const fcCarbon = carbonCostCents(fcKm * CO2_FREIGHT_PER_KM_KG);
  const restockRecovery = recovered(
    'restock',
    'Restock at full recovery',
    Math.round(p.clearingPriceCents * RESTOCK_RECOVERY_FRAC),
    true,
  );
  const restock: PathEv = {
    path: 'restock',
    viable: p.sealed === true && p.skuActive === true && RESTOCK_REASONS.has(p.reason),
    evCents: restockRecovery.totalCents - fcFreight - RESTOCK_HANDLING_CENTS - fcCarbon,
    terms: [
      ...restockRecovery.terms,
      { label: `FC inbound ${fcKm}km`, valueCents: -fcFreight },
      { label: 'Receive + shelve', valueCents: -RESTOCK_HANDLING_CENTS },
      { label: 'Freight carbon', valueCents: -fcCarbon },
    ],
  };

  const localRecovery = recovered(
    'local_resale',
    `Resale × ${Math.round(stp * 100)}% sell-through`,
    localResaleValue,
    true,
  );
  const local: PathEv = {
    path: 'local_resale',
    viable: p.nearbyBuyers >= 1,
    evCents: localRecovery.totalCents - p.localHandlingCents - localCarbon,
    terms: [
      ...localRecovery.terms,
      { label: 'Local handling', valueCents: -p.localHandlingCents },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };
  const refurbRecovery = recovered(
    'refurbish',
    `Refurbished resale × ${Math.round(stp * 100)}%`,
    refurbValue,
    true,
  );
  const refurbish: PathEv = {
    path: 'refurbish',
    viable: refurbViable,
    evCents: refurbRecovery.totalCents - refurbCost - p.localHandlingCents - localCarbon,
    terms: [
      ...refurbRecovery.terms,
      { label: 'Refurb cost', valueCents: -refurbCost },
      { label: 'Local handling', valueCents: -p.localHandlingCents },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };
  const donateRecovery = recovered('donate', 'Donation credit', donationValue, false);
  const donate: PathEv = {
    path: 'donate',
    viable: true,
    evCents: donateRecovery.totalCents - Math.round(p.localHandlingCents * 0.5) - localCarbon,
    terms: [
      ...donateRecovery.terms,
      { label: 'Handling', valueCents: -Math.round(p.localHandlingCents * 0.5) },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };
  const recycleRecovery = recovered('recycle', 'Recovered materials', recycleValue, false);
  const recycle: PathEv = {
    path: 'recycle',
    viable: true,
    evCents: recycleRecovery.totalCents - Math.round(p.localHandlingCents * 0.5) - localCarbon,
    terms: [
      ...recycleRecovery.terms,
      { label: 'Handling', valueCents: -Math.round(p.localHandlingCents * 0.5) },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };
  // The 21-day time-to-cash decay is the warehouse path's honest hidden cost:
  // returns-center dwell is price decay + working capital, not just freight.
  const warehouseRec = recovered('warehouse', 'FC liquidation recovery', warehouseRecovery, false);
  const warehouse: PathEv = {
    path: 'warehouse',
    viable: true,
    evCents: warehouseRec.totalCents - freightCost - freightCarbon,
    terms: [
      ...warehouseRec.terms,
      { label: `Freight ${p.warehouseDistanceKm}km`, valueCents: -freightCost },
      { label: 'Freight carbon', valueCents: -freightCarbon },
    ],
  };

  const paths = [restock, local, refurbish, donate, recycle, warehouse];

  // Confidence gates θ_r: low confidence collapses the eligible set toward the
  // ungated paths (recycle/warehouse) — i.e., toward today's flow. Applied last so
  // the glass-box screen still shows the gated path's full EV next to its reason.
  if (p.confidence !== undefined) {
    for (const e of paths) {
      const theta = CONFIDENCE_GATE[e.path];
      if (theta !== undefined && e.viable && p.confidence < theta) {
        e.viable = false;
        e.gateReason = `confidence ${p.confidence.toFixed(2)} below the ${theta} gate for ${e.path}`;
      }
    }
  }

  return paths;
}

const DWELL: Partial<Record<ReturnPath, number>> = { local_resale: 48, refurbish: 72, donate: 96 };
const FALLBACKS: Record<ReturnPath, ReturnPath[]> = {
  restock: ['local_resale', 'donate'], // seal broken at the hub → cascade locally
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
      ttlHours: TTL_HOURS[forced.path],
      // Avoiding the freight round-trip is the carbon saved when we stay local.
      co2SavedKg: savesCarbon ? freightCarbonKg : 0,
    };
  }

  // EV optimization over viable paths (argmax). Deterministic; ties broken by order.
  // recycle/warehouse are never confidence-gated, so `viable` is never empty.
  const viable = paths.filter((e) => e.viable);
  const best = viable.reduce((acc, e) => (e.evCents > acc.evCents ? e : acc));
  // Restock still ships one (short) leg to the nearest FC — the carbon saved is
  // the returns-center linehaul it avoided, net of that inbound leg.
  const fcKm = p.nearestFcKm ?? p.warehouseDistanceKm;
  const restockSavedKg = Math.max(
    0,
    Math.round((p.warehouseDistanceKm - fcKm) * CO2_FREIGHT_PER_KM_KG * 10) / 10,
  );
  const co2SavedKg =
    best.path === 'warehouse' ? 0 : best.path === 'restock' ? restockSavedKg : freightCarbonKg;

  return {
    ...base,
    decision: best.path,
    fallbackChain: FALLBACKS[best.path],
    dwellBudgetHours: DWELL[best.path] ?? 0,
    ttlHours: TTL_HOURS[best.path],
    co2SavedKg,
  };
}
