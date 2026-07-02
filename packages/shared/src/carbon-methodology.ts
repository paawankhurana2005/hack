// Avoided-emissions methodology (spec 015). Pure + deterministic + documented —
// no ML, no per-item magic numbers beyond the cited reference tables below.
//
// Two distinct mechanisms are modeled, on purpose — they are NOT the same number:
//   REUSE (resale/refurbish/donate displacing a new purchase) avoids the embodied
//   carbon of manufacturing a replacement. RECYCLE avoids landfill methane +
//   recovers a fraction of virgin material extraction — a much smaller number.
// Conflating them (treating recycle as a discount off the reuse figure) is a real
// methodological error; this module keeps them independently sourced.
//
// This is internal carbon INSETTING (avoided emissions counted toward Amazon's own
// Climate Pledge Scope-3 target — the same category as Amazon's re:Cycle reverse-
// logistics diversion reporting), NOT a third-party-verified tradable credit. Real
// registry credits (Verra/Gold Standard) require per-project MRV audits costing
// tens of thousands of dollars over months — impractical per resold item.

import type { ItemCategory } from './sell.js';

/**
 * Avoided-manufacturing baseline (kg CO2e), reuse-only: what's saved when this
 * item displaces the manufacture of a replacement. Same figures as the original
 * heuristic table — independently close to published LCA precedent (sneakers
 * ~14kg per MIT/Quantis; jeans ~33kg per Levi's LCA; smartphone ~55-90kg and
 * laptop ~200-350kg per manufacturer environmental reports, mostly manufacturing-
 * phase; ThredUp/Green Story runs the same category-based methodology
 * commercially). Conservative per category — heuristic and tunable, but the
 * relative ordering (electronics >> books) is the meaningful, defensible part.
 */
export const AVOIDED_MANUFACTURING_KG: Record<ItemCategory, number> = {
  electronics: 25,
  home: 15,
  fashion: 8,
  sports: 6,
  toys: 4,
  books: 1,
  other: 5,
};

/**
 * EPA WARM avoided emissions from diverting material from landfill: ~2.83 tCO2e
 * per short ton (907kg) of material, covering avoided landfill methane + partial
 * upstream virgin-material-extraction avoidance. Expressed per kg for item-level use.
 */
export const WARM_AVOIDED_KG_PER_KG_MATERIAL = 2830 / 907; // ≈ 3.12 kg CO2e / kg material

/**
 * Representative item weight (kg) per category — an explicit assumption, needed
 * only to convert WARM's per-kg-of-material figure into a per-item figure since
 * the catalog carries no weight field. Same spirit as the manufacturing table's
 * "heuristic and tunable" disclaimer.
 */
export const ITEM_WEIGHT_KG: Record<ItemCategory, number> = {
  electronics: 1.5,
  home: 4,
  fashion: 0.4,
  sports: 1.2,
  toys: 0.5,
  books: 0.3,
  other: 1,
};

// Recycling recovers materials but doesn't fully close the loop (processing loss,
// downcycling) — a standard partial-recovery discount on the WARM diversion figure.
const RECYCLE_RECOVERY_FRACTION = 0.5;

/**
 * Independent, WARM-grounded avoided-emissions figure for recycling — NOT a
 * multiplier of the reuse baseline. Materially smaller than
 * AVOIDED_MANUFACTURING_KG for the same category, reflecting that recycling
 * avoids landfill + partial material recovery, not a whole replacement.
 */
export const AVOIDED_RECYCLE_KG: Record<ItemCategory, number> = Object.fromEntries(
  Object.entries(ITEM_WEIGHT_KG).map(([category, weightKg]) => [
    category,
    Math.round(weightKg * WARM_AVOIDED_KG_PER_KG_MATERIAL * RECYCLE_RECOVERY_FRACTION * 10) / 10,
  ]),
) as Record<ItemCategory, number>;

// Donation is reuse, but not every donated item displaces a new purchase — a
// standard attributional discount on the manufacturing-avoidance figure.
export const DONATE_ATTRIBUTION_FRACTION = 0.7;

export type AvoidedEmissionsRoute = 'resell' | 'refurbish' | 'donate' | 'recycle';

/** Gross avoided emissions (kg CO2e) for a route, before subtracting logistics. */
function routeGrossKg(category: ItemCategory, route: AvoidedEmissionsRoute): number {
  switch (route) {
    case 'resell':
    case 'refurbish':
      return AVOIDED_MANUFACTURING_KG[category];
    case 'donate':
      return Math.round(AVOIDED_MANUFACTURING_KG[category] * DONATE_ATTRIBUTION_FRACTION);
    case 'recycle':
      return AVOIDED_RECYCLE_KG[category];
  }
}

/**
 * Net avoided emissions (kg CO2e) for routing an item this way instead of
 * warehouse/landfill: gross avoided emissions minus this route's own logistics
 * footprint. `logisticsCarbonKg` must come from the routing engine's already-
 * computed freight/handling terms (routing-ev.ts) — never recomputed here.
 */
export function computeAvoidedEmissionsKg(
  category: ItemCategory,
  route: AvoidedEmissionsRoute,
  logisticsCarbonKg: number,
): number {
  return Math.max(0, routeGrossKg(category, route) - logisticsCarbonKg);
}
