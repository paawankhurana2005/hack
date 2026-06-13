// Projected environmental impact of giving an item a second life instead of
// landfill + replacement. Pure + deterministic + documented — no per-item magic
// numbers. A real LCA model can replace the table without changing the contract.

import type { Money } from './common.js';
import type { ItemCategory } from './sell.js';

export interface ImpactEstimate {
  /** kg CO₂e avoided vs landfill + manufacturing a replacement. */
  co2SavedKg: number;
  /** Reward points, derived from carbon saved + value kept in circulation. */
  ecoCredits: number;
}

// Per-category embodied-carbon baseline (kg CO₂e) avoided by reuse. Heuristic and
// tunable — the relative ordering (electronics ≫ books) is the meaningful part.
const CO2_BASELINE_KG: Record<ItemCategory, number> = {
  electronics: 25,
  home: 15,
  fashion: 8,
  sports: 6,
  toys: 4,
  books: 1,
  other: 5,
};

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

// When resale isn't viable, routing beats landfill. Donating extends the item's
// life (fuller carbon benefit); recycling recovers materials (partial benefit).
const ROUTE_CO2_FACTOR: Record<'donate' | 'recycle', number> = {
  donate: 0.7,
  recycle: 0.4,
};

/**
 * Impact of routing an unsellable item to donate/recycle instead of landfill.
 * EcoCredits = round(co2SavedKg × 3) — carbon-only, no resale value to reward.
 */
export function estimateRouteImpact(
  category: ItemCategory,
  route: 'donate' | 'recycle',
): ImpactEstimate {
  const co2SavedKg = Math.round(CO2_BASELINE_KG[category] * ROUTE_CO2_FACTOR[route]);
  const ecoCredits = Math.round(co2SavedKg * 3);
  return { co2SavedKg, ecoCredits };
}
