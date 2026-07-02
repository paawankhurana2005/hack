// Pricing engine — the live read path. Glass-box, deterministic, write-free.
//
// finalPrice = base_price
//            × conditionFactor   (how good is the item)
//            × demandFactor       (precomputed lookup, never computed live)
//            × urgencyFactor      (computed inline from the pickup clock)
//            × categoryFactor     (static resale-fraction per category)
//
// This function does NO writes and is safe to call on every page view / refresh:
// it's a single point lookup of the return record plus a single lookup of the
// precomputed demand index, then pure arithmetic. Demand is never recomputed
// here, and urgency is never persisted — it's always derived at read time.

import type { PriceBreakdown } from '@reloop/shared';
import { getDb } from '../lib/mongo.js';
import {
  DEMAND_INDEX,
  RETURNS,
  type DemandIndexDoc,
  type ReturnRecordDoc,
} from '../lib/collections.js';
import { ReturnIncompleteError, ReturnNotFoundError } from '../lib/errors.js';

export type { PriceBreakdown };

// ── Tunables ─────────────────────────────────────────────────────────────────
// Every magic number lives here so the curve can be retuned without touching the
// logic below. Each lookup table carries a `default` used for unknown categories.
export const PRICING_CONFIG = {
  // conditionFactor = condition_score ^ alpha. Higher alpha = steeper penalty for
  // wear (electronics depreciate hard with damage; furniture is more forgiving).
  conditionAlpha: { electronics: 1.8, apparel: 1.3, furniture: 1.2, default: 1.5 } as Record<string, number>,
  // Static demand prior used when the demand index has no fresh entry for a cell.
  staticDemandPrior: { electronics: 1.15, apparel: 1.0, furniture: 0.9, default: 1.0 } as Record<string, number>,
  // Resale price as a fraction of original market value, by category.
  categoryFactor: { electronics: 0.75, apparel: 0.55, furniture: 0.7, books_media: 0.85, default: 0.65 } as Record<string, number>,
  // Urgency decay: urgencyFactor = 1 - k * (1 - t/T)^gamma. Discount deepens as
  // the pickup deadline approaches; bottoms out at (1 - k) when overdue.
  urgency: { k: 0.25, gamma: 3 },
  // A demand-index row older than this is treated as stale → fall back to prior.
  demandStaleMs: 24 * 60 * 60 * 1000,
  // Placeholder used when a return record has no condition_score yet.
  conditionScoreDefault: 0.7,
} as const;

function lookup(table: Record<string, number>, key: string, fallbackKey = 'default'): number {
  return table[key] ?? table[fallbackKey] ?? 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Demand factor — a point lookup against the precomputed index. Falls back to a
 * static category prior when the cell is missing or its rollup is stale. */
async function getDemandFactor(region_cluster: string, category: string): Promise<number> {
  const db = await getDb();
  const row = await db
    .collection<DemandIndexDoc>(DEMAND_INDEX)
    .findOne({ region_cluster, category });

  const fresh = row && Date.now() - row.computed_at.getTime() <= PRICING_CONFIG.demandStaleMs;
  return fresh ? row.score : lookup(PRICING_CONFIG.staticDemandPrior, category);
}

/** Urgency factor from the pickup clock. Computed inline — never stored. */
function computeUrgencyFactor(pickupDeadline: Date, listingCreatedAt: Date): { urgencyFactor: number; daysRemaining: number } {
  const now = Date.now();
  const t = pickupDeadline.getTime() - now; // time left
  const T = pickupDeadline.getTime() - listingCreatedAt.getTime(); // total window

  // Clamp t/T to [0,1] so overdue (t<0) and just-created (t≈T) listings, plus any
  // non-positive window from bad data, all stay well-defined.
  const ratio = T > 0 ? Math.min(1, Math.max(0, t / T)) : 0;
  const { k, gamma } = PRICING_CONFIG.urgency;
  const urgencyFactor = 1 - k * Math.pow(1 - ratio, gamma);

  return { urgencyFactor, daysRemaining: round2(Math.max(0, t) / (24 * 60 * 60 * 1000)) };
}

/**
 * Compute the live resale price for a return record, returning every factor for
 * transparency ("why this price"). Throws ReturnNotFoundError (→404) when the id
 * is unknown and ReturnIncompleteError (→400) when pricing inputs are missing.
 */
export async function calculatePrice(returnId: string): Promise<PriceBreakdown> {
  const db = await getDb();
  const record = await db.collection<ReturnRecordDoc>(RETURNS).findOne({ returnId });

  if (!record) {
    throw new ReturnNotFoundError(returnId);
  }

  // Validate the inputs pricing actually needs. condition_score is intentionally
  // NOT required here — it gets a placeholder default below until grading is wired.
  const missing: string[] = [];
  if (!record.category) missing.push('category');
  if (!record.region_cluster) missing.push('region_cluster');
  if (typeof record.base_price !== 'number') missing.push('base_price');
  if (!(record.pickup_deadline instanceof Date)) missing.push('pickup_deadline');
  if (!(record.listing_created_at instanceof Date)) missing.push('listing_created_at');
  if (missing.length > 0) {
    throw new ReturnIncompleteError(missing);
  }

  // TODO: condition_score currently defaults to 0.7 placeholder until AI grading is wired in
  const conditionScore = typeof record.condition_score === 'number' ? record.condition_score : PRICING_CONFIG.conditionScoreDefault;

  const alpha = lookup(PRICING_CONFIG.conditionAlpha, record.category);
  const conditionFactor = round2(Math.pow(conditionScore, alpha));
  const demandFactor = round2(await getDemandFactor(record.region_cluster, record.category));
  const categoryFactor = lookup(PRICING_CONFIG.categoryFactor, record.category);
  const { urgencyFactor: rawUrgency, daysRemaining } = computeUrgencyFactor(
    record.pickup_deadline,
    record.listing_created_at,
  );
  const urgencyFactor = round2(rawUrgency);

  const finalPrice = Math.round(
    record.base_price * conditionFactor * demandFactor * urgencyFactor * categoryFactor,
  );

  const breakdown =
    `₹${record.base_price} base × condition ${conditionFactor} × demand ${demandFactor} ` +
    `× urgency ${urgencyFactor} × category ${categoryFactor} → ₹${finalPrice} ` +
    `(${daysRemaining}d left)`;

  return {
    finalPrice,
    basePrice: record.base_price,
    conditionFactor,
    demandFactor,
    urgencyFactor,
    categoryFactor,
    daysRemaining,
    breakdown,
  };
}
