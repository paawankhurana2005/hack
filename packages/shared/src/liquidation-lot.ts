// Spec 016.1 — hub-staged liquidation lots (manifested pallets), the engine.
// Deterministic and glass-box like routing-ev: bid curves decide, no randomness.
//
// Grounding (why these numbers): Amazon's FBA Liquidations nets sellers ~5–10%
// of average selling price after a 15% referral fee + per-unit processing, paid
// 30–90 days out; Amazon sells to liquidators at ~20–30¢ on the retail dollar
// and the downstream chain averages 5–20¢. Manifested (item-listed, graded)
// pallets command materially more than mystery lots — that premium is exactly
// what a Health-Card manifest earns, and it is the reason liquidation deserves
// a first-class hub path instead of living inside warehouse economics.

import type { DefectTag, Grade } from './return.js';
import type { ItemCategory } from './sell.js';

/** One unit staged into a lot. */
export interface LotUnit {
  grade: Grade;
  clearingPriceCents: number;
  /** 0–1: how much of this unit's condition/history the Health Card covers. */
  manifestCoverage: number;
}

/** What a pallet is, economically: a grade histogram with a manifest. */
export interface LotComposition {
  category: ItemCategory;
  gradeHistogram: Record<Grade, number>;
  /** Mean predicted clearing price across units (paise). */
  avgClearingCents: number;
  /** 0–1: fraction of units carrying a full Health-Card manifest entry. */
  manifestCoverageFrac: number;
}

export type LotBuyerType = 'refurbisher' | 'wholesaler' | 'ngo' | 'fashion_reseller';

export interface LotValue {
  buyer: LotBuyerType;
  grossCents: number;
  amazonCutCents: number;
  sellerCents: number;
  /** CSR/tax credit for zero-cash NGO lots (not part of gross). */
  csrCreditCents: number;
  /** Signed contributions per grade bucket + premium, for the glass-box screen. */
  terms: { label: string; valueCents: number }[];
}

export interface ShipVerdict {
  shipNow: boolean;
  /** Units at which waiting stops paying (amortization gain = decay loss). */
  breakevenUnits: number;
  reason: string;
}

// --- Tunable lot economics -----------------------------------------------------

/**
 * Per-item liquidation recovery as a fraction of predicted CLEARING price
 * (clearing ≈ 0.6 × retail), unmanifested. electronics 0.30 × 0.6 ≈ 18¢ on the
 * retail dollar — inside the real 5–20¢ liquidator-chain band; apparel worst.
 * Consumed by routing-ev's per-item `liquidate` path.
 */
export const LIQUIDATION_RECOVERY_FRAC: Record<ItemCategory, number> = {
  electronics: 0.3,
  home: 0.22,
  sports: 0.2,
  toys: 0.2,
  fashion: 0.15,
  books: 0.1,
  other: 0.18,
};

/**
 * Manifest premium: graded, item-listed pallets clear higher than mystery lots.
 * Full Health-Card coverage at full grading confidence lifts electronics from
 * ~18¢ to ~27¢ on the retail dollar — the manifested top of the 20–30¢ band.
 */
export const MANIFEST_PREMIUM_MAX = 0.5;
export function manifestPremium(coverage: number, confidence = 1): number {
  const c = Math.min(1, Math.max(0, coverage));
  const k = Math.min(1, Math.max(0, confidence));
  return 1 + MANIFEST_PREMIUM_MAX * c * k;
}

/**
 * What each buyer type bids per unit, as a fraction of the unit's clearing
 * price, before the manifest premium. Refurbishers pay a premium for
 * repairable B/C stock (repair margin); wholesalers want clean A/B; NGOs are
 * zero-cash but carry a CSR/tax credit; fashion resellers only want top grades.
 */
export const BID_CURVES: Record<LotBuyerType, Record<Grade, number>> = {
  refurbisher: { A: 0.3, B: 0.34, C: 0.3, Salvage: 0.1 },
  wholesaler: { A: 0.4, B: 0.3, C: 0.12, Salvage: 0.02 },
  ngo: { A: 0, B: 0, C: 0, Salvage: 0 },
  fashion_reseller: { A: 0.35, B: 0.22, C: 0.08, Salvage: 0 },
};

/** CSR/tax-credit residual for donated (NGO) lots, mirroring DONATION_VALUE_FRAC. */
export const NGO_CSR_CREDIT_FRAC = 0.15;

/** ReLoop's take on brokered lots — undercuts FBA Liquidations' 15% referral. */
export const AMAZON_TAKE_RATE = 0.1;

/** Which buyer types bid on which categories (mirrors the partner registry). */
const BUYER_CATEGORIES: Record<LotBuyerType, ItemCategory[] | 'any'> = {
  refurbisher: ['electronics'],
  wholesaler: 'any',
  ngo: 'any',
  fashion_reseller: ['fashion'],
};

const BUYER_ORDER: LotBuyerType[] = ['refurbisher', 'wholesaler', 'fashion_reseller', 'ngo'];

export const PALLET_CAPACITY = 40;
/** One partner-haul pickup (₹2,500) — the fixed cost ship-vs-wait amortizes. */
export const PALLET_PICKUP_FIXED_CENTS = 250_000;

const GRADES: Grade[] = ['A', 'B', 'C', 'Salvage'];

function eligibleBuyers(category: ItemCategory): LotBuyerType[] {
  return BUYER_ORDER.filter((b) => {
    const cats = BUYER_CATEGORIES[b];
    return cats === 'any' || cats.includes(category);
  });
}

/** Value a lot for one buyer type: Σ per-grade bids × manifest premium − take. */
export function lotValueCents(lot: LotComposition, buyer: LotBuyerType): LotValue {
  const premium = manifestPremium(lot.manifestCoverageFrac);
  const curve = BID_CURVES[buyer];
  const terms: { label: string; valueCents: number }[] = [];
  let base = 0;
  for (const g of GRADES) {
    const units = lot.gradeHistogram[g] ?? 0;
    if (units <= 0) continue;
    const v = Math.round(units * lot.avgClearingCents * curve[g]);
    base += v;
    if (v > 0) terms.push({ label: `${units}× grade ${g} @ ${Math.round(curve[g] * 100)}%`, valueCents: v });
  }
  const premiumCents = Math.round(base * (premium - 1));
  if (premiumCents > 0) {
    terms.push({
      label: `Manifest premium (Health-Card coverage ${Math.round(lot.manifestCoverageFrac * 100)}%)`,
      valueCents: premiumCents,
    });
  }
  const grossCents = base + premiumCents;
  const amazonCutCents = Math.round(grossCents * AMAZON_TAKE_RATE);
  const totalUnits = GRADES.reduce((n, g) => n + (lot.gradeHistogram[g] ?? 0), 0);
  const csrCreditCents =
    buyer === 'ngo' ? Math.round(totalUnits * lot.avgClearingCents * NGO_CSR_CREDIT_FRAC) : 0;
  if (buyer === 'ngo' && csrCreditCents > 0) {
    terms.push({ label: 'CSR/tax credit (zero-cash donation lot)', valueCents: csrCreditCents });
  }
  return { buyer, grossCents, amazonCutCents, sellerCents: grossCents - amazonCutCents, csrCreditCents, terms };
}

/** Argmax over eligible buyers by seller proceeds (CSR credit breaks NGO ties). */
export function bestBuyer(lot: LotComposition): LotValue {
  const candidates = eligibleBuyers(lot.category).map((b) => lotValueCents(lot, b));
  return candidates.reduce((acc, v) =>
    v.sellerCents + v.csrCreditCents > acc.sellerCents + acc.csrCreditCents ? v : acc,
  );
}

/** Second-best eligible buyer — deterministic re-match when a deal falls through. */
export function secondBestBuyer(lot: LotComposition): LotValue | null {
  const candidates = eligibleBuyers(lot.category)
    .map((b) => lotValueCents(lot, b))
    .sort((a, b) => b.sellerCents + b.csrCreditCents - (a.sellerCents + a.csrCreditCents));
  return candidates[1] ?? null;
}

/**
 * Ship-now-vs-wait: waiting adds units that amortize the fixed pickup cost, but
 * every day of waiting decays the whole lot's value. Marginal analysis gives a
 * closed-form breakeven lot size n* = √(F·λ / (δ_daily·v̄)) — below it, waiting's
 * amortization gain beats decay loss; at/above it (or at capacity), ship.
 */
export function shipNowOrWait(
  lot: LotComposition,
  opts: { pickupFixedCents?: number; arrivalRatePerDay?: number; weeklyDecay?: number } = {},
): ShipVerdict {
  const F = opts.pickupFixedCents ?? PALLET_PICKUP_FIXED_CENTS;
  const lambda = Math.max(0.1, opts.arrivalRatePerDay ?? 6);
  const deltaDaily = Math.max(0.0005, (opts.weeklyDecay ?? 0.01) / 7);
  const units = GRADES.reduce((n, g) => n + (lot.gradeHistogram[g] ?? 0), 0);
  const perUnitNet = bestBuyer(lot).sellerCents / Math.max(1, units);
  const breakevenUnits = Math.min(
    PALLET_CAPACITY,
    Math.ceil(Math.sqrt((F * lambda) / (deltaDaily * Math.max(1, perUnitNet)))),
  );
  if (units >= PALLET_CAPACITY) {
    return { shipNow: true, breakevenUnits, reason: `Pallet full (${units}/${PALLET_CAPACITY}) — ship now` };
  }
  if (units >= breakevenUnits) {
    return {
      shipNow: true,
      breakevenUnits,
      reason: `Ship now — at ${units} units, daily value decay outweighs amortizing the ₹${Math.round(F / 100).toLocaleString('en-IN')} pickup further`,
    };
  }
  return {
    shipNow: false,
    breakevenUnits,
    reason: `Hold — ${breakevenUnits - units} more units amortize the ₹${Math.round(F / 100).toLocaleString('en-IN')} pickup below the decay loss`,
  };
}

// --- Defect tagging (feeds the engine's defect-level refurb table) --------------

const DEFECT_MATCHERS: [RegExp, DefectTag][] = [
  [/charger|power\s*adapter|adaptor/i, 'missing_charger'],
  [/cable|cord|wire/i, 'missing_cable'],
  [/screen|display/i, 'scratched_screen'],
  [/manual|documentation|booklet/i, 'missing_manual'],
  [/packag|box\s*(damage|torn|missing)/i, 'worn_packaging'],
  [/batter/i, 'dead_battery'],
  [/accessor|remote|strap|attachment/i, 'missing_accessory'],
  [/scuff|scratch|worn|wear|dent|mark/i, 'scuffed_body'],
];

/**
 * Deterministic keyword mapper: free-text grader defects → the DefectTag
 * vocabulary the DEFECT_REPAIR_TABLE prices. First matcher wins per defect;
 * unrecognized defects are dropped (they price via grade-level fallback).
 */
export function tagDefects(defects: string[]): DefectTag[] {
  const tags: DefectTag[] = [];
  for (const d of defects) {
    const hit = DEFECT_MATCHERS.find(([re]) => re.test(d));
    if (hit && !tags.includes(hit[1])) tags.push(hit[1]);
  }
  return tags;
}
