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

/** EcoCredits = round(co2SavedKg × 3 + resaleDollars × 0.1). */
export function estimateImpact(category: ItemCategory, resaleValue: Money): ImpactEstimate {
  const co2SavedKg = CO2_BASELINE_KG[category];
  const resaleDollars = resaleValue.amountCents / 100;
  const ecoCredits = Math.round(co2SavedKg * 3 + resaleDollars * 0.1);
  return { co2SavedKg, ecoCredits };
}
