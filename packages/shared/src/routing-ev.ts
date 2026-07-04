// Smart Routing / Intelligent Bridge as expected-value optimization (Phase 3).
// "Logic decides, the model narrates" — unchanged. The decision is made in TWO
// deterministic, auditable layers:
//   1. HARD CONSTRAINTS (safety/legal) — an ordered, first-match ladder that can
//      force a path and is NEVER optimized away.
//   2. EV OPTIMIZATION — for the remaining viable paths, pick the one that maximizes
//      expected recovered value − cost − carbon penalty, using ML-predicted inputs
//      (clearing price × sell-through from P1/P2) and real freight/distance math.
// Every term is returned for on-screen explanation; pure + deterministic + reproducible.

import type { DefectTag, Grade, GradePosterior, ReturnReason, ReturnRoutingDecision } from './return.js';
import { LIQUIDATION_RECOVERY_FRAC, manifestPremium } from './liquidation-lot.js';
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
  // --- Spec 016/016.1: decision-under-uncertainty inputs (all optional —
  // legacy callers still typecheck and hard-ladder outcomes are identical;
  // absolute EVs were recalibrated by 016.1's honest warehouse economics).
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
  // --- Spec 016.1 inputs ---------------------------------------------------
  /** Structured defect tags → defect-level refurb economics (repair cost + grade delta). */
  defectTags?: DefectTag[];
  /** 0–1: Health-Card manifest coverage — drives the pallet's manifest premium. */
  manifestCoverage?: number;
  /** 0–1: customer trust score; gates the returnless-refund path (undefined = ineligible). */
  customerTrust?: number;
  /** Any fraud signal (wardrobing, photo reuse) — hard-blocks returnless refund. */
  fraudSignal?: boolean;
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

// --- Spec 016.1: the warehouse path priced honestly -----------------------------
// Reality check: only ~10–20% of returns get restocked after the linehaul +
// weeks of dwell; the rest liquidate — Amazon sells to liquidators at 20–30¢ on
// the retail dollar and FBA Liquidations nets sellers ~5–10% of ASP. The old
// flat 0.6 recovery was fantasy. Warehouse is now a mixture:
//   P(restock after inspection) × post-markdown recovery
// + P(liquidate)               × unmanifested FC-liquidation recovery
// Blended ≈ 0.2975 of clearing (≈18¢ retail), before the 21-day dwell decay.
const WAREHOUSE_P_RESTOCK = 0.15;
const WAREHOUSE_RESTOCK_RECOVERY_FRAC = 0.85; // restocked weeks later → sold post-markdown
const WAREHOUSE_LIQUIDATION_FRAC = 0.2; // unmanifested pallet at the FC (≈12¢ retail)

// Hub-pallet share of staging labor (no listing, no customer touch — just a shelf
// and a manifest stamp).
const LIQUIDATE_HANDLING_FRAC = 0.4;

// Refurbishment only helps when there's condition to recover: a near-new item gains
// almost nothing, a worn one gains a lot. Cost rises with how much work it needs.
// Grade-level fallback — used when no structured defect tags are available.
const REFURB_UPLIFT_BY_GRADE: Record<'A' | 'B' | 'C', number> = { A: 0.05, B: 0.18, C: 0.35 };
const REFURB_COST_BY_GRADE: Record<'A' | 'B' | 'C', number> = { A: 0.12, B: 0.2, C: 0.3 };

// --- Spec 016.1: defect-level refurb economics -----------------------------------
// The spec's promise made concrete: "missing charger: ₹300, B→A, +₹1,500".
// Each tag prices a repair (absolute paise) and a grade delta; the uplift falls
// out of GRADE_VALUE_FRAC (repairing B→A is worth (1.0−0.85)/0.85 ≈ +18% —
// consistent with the grade-level fallback by construction).
const DEFECT_REPAIR_TABLE: Record<DefectTag, { repairCostCents: number; gradeSteps: 0 | 1 }> = {
  missing_charger: { repairCostCents: 30_000, gradeSteps: 1 },
  missing_cable: { repairCostCents: 15_000, gradeSteps: 1 },
  scratched_screen: { repairCostCents: 90_000, gradeSteps: 1 },
  scuffed_body: { repairCostCents: 20_000, gradeSteps: 1 },
  worn_packaging: { repairCostCents: 8_000, gradeSteps: 1 },
  missing_manual: { repairCostCents: 5_000, gradeSteps: 0 },
  dead_battery: { repairCostCents: 120_000, gradeSteps: 1 },
  missing_accessory: { repairCostCents: 25_000, gradeSteps: 1 },
};

// --- Spec 016.1: E[correction_cost(r)] — the EV formula's missing term ----------
// Being wrong has a price, and it differs wildly by route: a bad unit reaching a
// buyer as "new" costs a second return (~$27 per $100 order of processing) plus
// trust; a mis-graded unit on a pallet costs a ₹15 re-sort. Expected correction
// cost = (posterior mass below the grade the route needs) × redirect cost.
const CORRECTION_MIN_GRADE: Partial<Record<ReturnPath, Grade>> = {
  restock: 'A',
  local_resale: 'B',
  refurbish: 'C',
  liquidate: 'C', // must at least be functional — only Salvage mass is "wrong"
};
function redirectCostCents(path: ReturnPath, clearingPriceCents: number): number {
  switch (path) {
    case 'restock':
      return Math.round(0.27 * clearingPriceCents) + 25_000; // second return + trust penalty
    case 'local_resale':
      return 4_000; // hub shelf move
    case 'refurbish':
      return 8_000; // wasted bench slot
    case 'liquidate':
      return 1_500; // pallet re-sort
    default:
      return 0; // donate/recycle/warehouse — being wrong is (nearly) free
  }
}

// --- Spec 016.1: returnless refund — "the best route is no route" ----------------
// Amazon's real lever: for cheap items, processing (~$27 per $100 order) wipes
// out every recovery path. When ALL movement paths have negative EV, refund and
// let the customer keep it. Hard-gated: never high-value, never with any fraud
// signal, and only when trust × confidence clears the same lever that times
// refunds at pickup (spec 016 stage 4).
const RETURNLESS_MAX_VALUE_CENTS = 80_000; // ₹800
const RETURNLESS_TRUST_GATE = 0.5; // customerTrust × confidence threshold
const RETURNLESS_AVOIDED_PICKUP_CENTS = 9_000; // ₹90 last-mile stop avoided

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
  liquidate: 7, // hub pallet fills + partner pickup ≈ 1 week (vs 30–90d FBA payout)
  donate: 2,
  recycle: 2,
  warehouse: 21,
  return_to_seller: 0,
  returnless_refund: 0,
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

// Confidence gates θ_r — DERIVED from correction cost (redirectCostCents above),
// not arbitrary: the θ ordering mirrors the redirect-cost ordering exactly.
// restock (second return + trust, ~₹700+ on a ₹2.5k item) → 0.85
// local_resale (hub shelf move, ₹40)                      → 0.6
// refurbish (wasted bench slot, ₹80 but pre-buyer)        → 0.5
// donate (being wrong is nearly free)                     → 0.3
// liquidate (pallet re-sort, ₹15 — cheapest commercial)   → 0.2
// recycle/warehouse are never gated, so the eligible set can only collapse
// toward low-stakes aggregate flows and, ultimately, today's flow — graceful
// degradation with no special-case code path.
const CONFIDENCE_GATE: Partial<Record<ReturnPath, number>> = {
  restock: 0.85,
  local_resale: 0.6,
  refurbish: 0.5,
  donate: 0.3,
  liquidate: 0.2,
};
/** Exported for the eval harness: θ ordering must track redirect-cost ordering. */
export const CONFIDENCE_GATE_THETA = CONFIDENCE_GATE;

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
  liquidate: 48, // pallet needs time to fill
  donate: 48,
  recycle: 72,
  warehouse: 72,
  return_to_seller: 72,
  returnless_refund: 72, // terminal — nothing to re-evaluate
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
  // it did). Both no-op when the optional inputs are absent.
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

  // Spec 016.1: defect-level refurb economics when structured tags exist —
  // repair cost is the sum of the table's absolute costs, uplift falls out of
  // the grade delta the repairs achieve ((frac(g′) − frac(g)) / frac(g)).
  // Falls back to the grade-level fractions when no tags are available.
  const tags = p.defectTags ?? [];
  let refurbValue: number;
  let refurbCost: number;
  let refurbValueLabel: string;
  let refurbCostLabel = 'Refurb cost';
  if (tags.length > 0) {
    const gradeOrder: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    const gi = gradeOrder.indexOf(rg);
    const steps = Math.min(
      gi, // can't repair above A
      tags.reduce((s, t) => s + DEFECT_REPAIR_TABLE[t].gradeSteps, 0),
    );
    const target = gradeOrder[gi - steps] ?? rg;
    const upliftFrac = (GRADE_VALUE_FRAC[target] - GRADE_VALUE_FRAC[rg]) / GRADE_VALUE_FRAC[rg];
    refurbValue = Math.round(p.clearingPriceCents * (1 + upliftFrac) * stp);
    refurbCost = tags.reduce((s, t) => s + DEFECT_REPAIR_TABLE[t].repairCostCents, 0);
    refurbValueLabel =
      steps > 0
        ? `Repaired ${rg}→${target} resale × ${Math.round(stp * 100)}%`
        : `Refurbished resale × ${Math.round(stp * 100)}%`;
    refurbCostLabel = `Defect repairs (${tags.map((t) => t.replace(/_/g, ' ')).join(', ')})`;
  } else {
    refurbValue = Math.round(p.clearingPriceCents * (1 + REFURB_UPLIFT_BY_GRADE[rg]) * stp);
    refurbCost = Math.round(p.clearingPriceCents * REFURB_COST_BY_GRADE[rg]);
    refurbValueLabel = `Refurbished resale × ${Math.round(stp * 100)}%`;
  }
  // Refurbish is only viable when there's condition to recover (worn grade) or the
  // item couldn't be functionally verified from photos (needs a bench check) — AND
  // a downstream channel exists: a repaired unit re-enters local resale, so with
  // zero nearby demand there is nowhere for it to go (016.1 fix).
  const refurbViable =
    (p.grade === 'B' || p.grade === 'C' || !p.functionallyVerifiable) && p.nearbyBuyers >= 1;
  const donationValue = Math.round(p.clearingPriceCents * DONATION_VALUE_FRAC);
  const recycleValue = Math.round(p.clearingPriceCents * RECYCLE_VALUE_FRAC);

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
  const refurbRecovery = recovered('refurbish', refurbValueLabel, refurbValue, true);
  const refurbish: PathEv = {
    path: 'refurbish',
    viable: refurbViable,
    evCents: refurbRecovery.totalCents - refurbCost - p.localHandlingCents - localCarbon,
    terms: [
      ...refurbRecovery.terms,
      { label: refurbCostLabel, valueCents: -refurbCost },
      { label: 'Local handling', valueCents: -p.localHandlingCents },
      { label: 'Carbon', valueCents: -localCarbon },
    ],
  };

  // Spec 016.1: liquidate — a graded, Health-Card-manifested pallet staged at the
  // hub. Grade-INsensitive (the buyer's bid curve absorbs grade risk, not the mix
  // factor); the manifest premium is the market's price for grading at source.
  const liqFrac = LIQUIDATION_RECOVERY_FRAC[p.category ?? 'other'];
  const liqPremium = manifestPremium(p.manifestCoverage ?? 0, p.confidence ?? 1);
  const liqBase = Math.round(p.clearingPriceCents * liqFrac);
  const liqPremiumCents = Math.round(liqBase * (liqPremium - 1));
  const liqTerms: EvTerm[] = [
    { label: `Pallet liquidation (${Math.round(liqFrac * 100)}% of clearing)`, valueCents: liqBase },
  ];
  let liqValue = liqBase;
  if (liqPremiumCents !== 0) {
    liqTerms.push({
      label: `Manifest premium (Health-Card ${Math.round((p.manifestCoverage ?? 0) * 100)}%)`,
      valueCents: liqPremiumCents,
    });
    liqValue += liqPremiumCents;
  }
  const liqDecay = decayFactor(p.category, 'liquidate');
  if (liqDecay !== 1) {
    const adj = Math.round(liqValue * (liqDecay - 1));
    if (adj !== 0) {
      liqTerms.push({ label: `Value decay (${TIME_TO_CASH_DAYS.liquidate}d to cash)`, valueCents: adj });
      liqValue += adj;
    }
  }
  const liqHandling = Math.round(p.localHandlingCents * LIQUIDATE_HANDLING_FRAC);
  const liquidate: PathEv = {
    path: 'liquidate',
    // Pallets take anything functional/graded; Salvage is hard-laddered to recycle.
    viable: p.functionallyVerifiable || p.grade !== null,
    evCents: liqValue - liqHandling - localCarbon,
    terms: [
      ...liqTerms,
      { label: 'Pallet staging (hub)', valueCents: -liqHandling },
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
  // The warehouse path priced honestly (016.1): a mixture of "maybe restocked
  // after inspection" and "unmanifested FC liquidation", then the 21-day dwell
  // decay — returns-center dwell is price decay + working capital, not just
  // freight. Both mixture components surface as their own glass-box terms.
  const whRestockPart = Math.round(
    p.clearingPriceCents * WAREHOUSE_P_RESTOCK * WAREHOUSE_RESTOCK_RECOVERY_FRAC,
  );
  const whLiquidatePart = Math.round(
    p.clearingPriceCents * (1 - WAREHOUSE_P_RESTOCK) * WAREHOUSE_LIQUIDATION_FRAC,
  );
  const whTerms: EvTerm[] = [
    {
      label: `Restock after inspection (${Math.round(WAREHOUSE_P_RESTOCK * 100)}% × ${Math.round(WAREHOUSE_RESTOCK_RECOVERY_FRAC * 100)}%)`,
      valueCents: whRestockPart,
    },
    {
      label: `FC liquidation (${Math.round((1 - WAREHOUSE_P_RESTOCK) * 100)}% × ${Math.round(WAREHOUSE_LIQUIDATION_FRAC * 100)}%)`,
      valueCents: whLiquidatePart,
    },
  ];
  let whValue = whRestockPart + whLiquidatePart;
  const whDecay = decayFactor(p.category, 'warehouse');
  if (whDecay !== 1) {
    const adj = Math.round(whValue * (whDecay - 1));
    if (adj !== 0) {
      whTerms.push({ label: `Value decay (${TIME_TO_CASH_DAYS.warehouse}d to cash)`, valueCents: adj });
      whValue += adj;
    }
  }
  const warehouse: PathEv = {
    path: 'warehouse',
    viable: true,
    evCents: whValue - freightCost - freightCarbon,
    terms: [
      ...whTerms,
      { label: `Freight ${p.warehouseDistanceKm}km`, valueCents: -freightCost },
      { label: 'Freight carbon', valueCents: -freightCarbon },
    ],
  };

  // Spec 016.1: returnless refund — no route at all. The refund is paid on every
  // path, so its EV is purely the movement costs avoided. Excluded from the
  // argmax (those savings exist on every path's "don't move" counterfactual);
  // decideRoute applies it only when every movement path has NEGATIVE EV.
  const returnlessSavings =
    RETURNLESS_AVOIDED_PICKUP_CENTS + Math.round(p.localHandlingCents * 0.5);
  const trustProduct = (p.customerTrust ?? -1) * (p.confidence ?? 1);
  let returnlessGate: string | undefined;
  if (p.customerTrust === undefined) returnlessGate = 'no customer trust signal — ineligible';
  else if (p.clearingPriceCents >= RETURNLESS_MAX_VALUE_CENTS)
    returnlessGate = 'high-value item — must be physically recovered';
  else if (p.fraudSignal || p.reasonGradeMismatch || !p.authenticityMatch)
    returnlessGate = 'fraud signal present — refund only against physical custody';
  else if (trustProduct < RETURNLESS_TRUST_GATE)
    returnlessGate = `trust × confidence ${Math.max(0, trustProduct).toFixed(2)} below the ${RETURNLESS_TRUST_GATE} gate`;
  const returnless: PathEv = {
    path: 'returnless_refund',
    viable: returnlessGate === undefined,
    gateReason: returnlessGate,
    evCents: returnlessSavings,
    terms: [
      { label: 'Avoided pickup (last-mile stop)', valueCents: RETURNLESS_AVOIDED_PICKUP_CENTS },
      { label: 'Avoided hub handling', valueCents: Math.round(p.localHandlingCents * 0.5) },
    ],
  };

  const paths = [restock, local, refurbish, liquidate, donate, recycle, warehouse, returnless];

  // Spec 016.1: E[correction_cost(r)] — the EV formula's missing term, now real.
  // Expected cost of routing wrong = posterior mass below the grade the route
  // needs × that route's redirect cost. Makes the θ gates principled AND visible.
  if (p.gradePosterior) {
    const gradeOrder: Grade[] = ['A', 'B', 'C', 'Salvage'];
    for (const e of paths) {
      const min = CORRECTION_MIN_GRADE[e.path];
      if (!min) continue;
      const below = gradeOrder
        .slice(gradeOrder.indexOf(min) + 1)
        .reduce((s, g) => s + (p.gradePosterior?.[g] ?? 0), 0);
      const cost = Math.round(below * redirectCostCents(e.path, p.clearingPriceCents));
      if (cost > 0) {
        e.terms.push({ label: 'Expected correction cost', valueCents: -cost });
        e.evCents -= cost;
      }
    }
  }

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

const DWELL: Partial<Record<ReturnPath, number>> = {
  local_resale: 48,
  refurbish: 72,
  liquidate: 96, // pallet fill window
  donate: 96,
};
const FALLBACKS: Record<ReturnPath, ReturnPath[]> = {
  restock: ['local_resale', 'donate'], // seal broken at the hub → cascade locally
  local_resale: ['liquidate', 'donate'], // unsold listing joins the pallet, same building
  refurbish: ['local_resale', 'donate'],
  liquidate: ['donate', 'recycle'],
  donate: ['recycle'],
  recycle: [],
  warehouse: [],
  return_to_seller: [],
  returnless_refund: [],
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

  // EV optimization over viable MOVEMENT paths (argmax). Deterministic; ties
  // broken by order. recycle/warehouse are never confidence-gated, so `viable`
  // is never empty. returnless_refund is excluded — its "EV" is avoided cost
  // that exists on every path's don't-move counterfactual, so it only wins via
  // the explicit all-paths-negative rule below.
  const viable = paths.filter((e) => e.viable && e.path !== 'returnless_refund');
  const best = viable.reduce((acc, e) => (e.evCents > acc.evCents ? e : acc));

  // Spec 016.1: the best route is no route. If even the argmax LOSES money and
  // the trust/fraud/value gates all pass, refund and let the customer keep it —
  // zero legs, zero handling, zero carbon (Amazon's real returnless lever,
  // decided deterministically instead of ad hoc).
  const returnless = byPath('returnless_refund');
  if (returnless?.viable && best.evCents < 0) {
    return {
      ...base,
      decision: 'returnless_refund',
      hardRule: 'every movement path loses money → returnless refund (item stays with the customer)',
      fallbackChain: FALLBACKS.returnless_refund,
      dwellBudgetHours: 0,
      ttlHours: TTL_HOURS.returnless_refund,
      // Nothing moves at all: the linehaul AND the local trip are both avoided.
      co2SavedKg: Math.round((freightCarbonKg + CO2_LOCAL_KG) * 10) / 10,
    };
  }
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
