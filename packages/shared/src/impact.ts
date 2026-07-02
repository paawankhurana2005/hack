// Projected environmental impact of giving an item a second life instead of
// landfill + replacement. Pure + deterministic + documented — no per-item magic
// numbers. A real LCA model can replace the table without changing the contract.

import type { Money } from './common.js';
import type { ItemCategory } from './sell.js';
import {
  AVOIDED_MANUFACTURING_KG,
  AVOIDED_RECYCLE_KG,
  DONATE_ATTRIBUTION_FRACTION,
} from './carbon-methodology.js';

export interface ImpactEstimate {
  /** kg CO₂e avoided vs landfill + manufacturing a replacement. */
  co2SavedKg: number;
  /** Reward points, derived from carbon saved + value kept in circulation. */
  ecoCredits: number;
}

// Per-category embodied-carbon baseline (kg CO₂e) avoided by reuse — sourced from
// carbon-methodology.ts's cited, WARM/LCA-grounded reference table.
const CO2_BASELINE_KG = AVOIDED_MANUFACTURING_KG;

/** Seller side. EcoCredits = round(co2SavedKg × 3 + resaleRupees × 0.002). */
export function estimateImpact(category: ItemCategory, resaleValue: Money): ImpactEstimate {
  const co2SavedKg = CO2_BASELINE_KG[category];
  const resaleRupees = resaleValue.amountCents / 100;
  const ecoCredits = Math.round(co2SavedKg * 3 + resaleRupees * 0.002);
  return { co2SavedKg, ecoCredits };
}

/**
 * Buyer side — reward for choosing second-life over buying new: the same carbon
 * diverted, plus value kept in circulation (what the buyer saved vs new).
 * EcoCredits = round(co2SavedKg × 3 + savedRupees × 0.002).
 */
export function estimateBuyerImpact(
  category: ItemCategory,
  originalPrice: Money,
  listingPrice: Money,
): ImpactEstimate {
  const co2SavedKg = CO2_BASELINE_KG[category];
  const savedRupees = Math.max(0, (originalPrice.amountCents - listingPrice.amountCents) / 100);
  const ecoCredits = Math.round(co2SavedKg * 3 + savedRupees * 0.002);
  return { co2SavedKg, ecoCredits };
}

/**
 * Impact of routing an unsellable item to donate/recycle instead of landfill.
 * Donate is reuse (a discounted share of avoided-manufacturing — not every
 * donation displaces a purchase); recycle is an independently WARM-sourced
 * material-recovery figure (see carbon-methodology.ts), NOT a multiplier of
 * the donate/reuse number — recycling avoids landfill + partial material
 * recovery, not a whole replacement's manufacturing footprint.
 * EcoCredits = round(co2SavedKg × 3) — carbon-only, no resale value to reward.
 */
export function estimateRouteImpact(
  category: ItemCategory,
  route: 'donate' | 'recycle',
): ImpactEstimate {
  const co2SavedKg =
    route === 'donate'
      ? Math.round(CO2_BASELINE_KG[category] * DONATE_ATTRIBUTION_FRACTION)
      : AVOIDED_RECYCLE_KG[category];
  const ecoCredits = Math.round(co2SavedKg * 3);
  return { co2SavedKg, ecoCredits };
}
