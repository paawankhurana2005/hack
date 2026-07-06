// Real geo-demand wiring for the reprice engine (spec 024, phase A). Before this,
// PricingStateVector's "geo / local" feature group (nearbyBuyerCount,
// localSupplyCount, geoDemandIndex) was permanently hardcoded in fillState() —
// every decision and every retrain row trained on noise, not signal. Real geo
// infrastructure already existed (the buyers 2dsphere index, the demand_index
// rollup) — it was simply never connected. This file is the connection, not new
// infrastructure.
//
// No-ops to `{}` when Mongo isn't configured or there's nothing to look up, so
// reprice-engine.ts's existing `?? 5 / ?? 3 / ?? 0.5` defaults remain the exact
// same safety net they always were — this is additive, not a replacement.

import { getDb, isMongoConfigured } from '../../lib/mongo.js';
import { log } from '../../lib/logger.js';
import { getPincodeCoordinates, getRegionCluster } from '../../lib/regionCluster.js';
import { getDemandFactor } from '../pricingEngine.js';
import { BUYERS, MATCH_SESSIONS, RETURNS, type ReturnRecordDoc } from '../../lib/collections.js';
import { SEARCH_RADIUS_KM } from '../matchingEngine.js';

export interface GeoPricingFeatures {
  nearbyBuyerCount?: number;
  localSupplyCount?: number;
  geoDemandIndex?: number;
  /** Resolved region cluster (spec 024, phase 8) — not a PricingStateVector
   *  feature; returned so the caller can pool bandit posteriors by it as a
   *  third ContextBucket dimension, not just use it as a flat input. */
  regionCluster?: string;
}

export interface GeoFeatureInput {
  pincode?: string;
  returnId?: string;
  category: string;
}

/** Resolve real geo-demand features for a reprice decision. Never throws — any
 * lookup failure is logged and swallowed, returning `{}` so the caller's
 * existing placeholder defaults apply exactly as before. */
export async function resolveGeoPricingFeatures(input: GeoFeatureInput): Promise<GeoPricingFeatures> {
  if (!isMongoConfigured()) return {};

  try {
    const db = await getDb();
    let pincode = input.pincode;

    if (!pincode && input.returnId) {
      const record = await db.collection<ReturnRecordDoc>(RETURNS).findOne({ returnId: input.returnId });
      pincode = record?.pincode;
    }
    if (!pincode) return {};

    const regionCluster = getRegionCluster(pincode);
    const coords = getPincodeCoordinates(pincode);

    const [nearbyBuyerCount, localSupplyCount, geoDemandIndex] = await Promise.all([
      db.collection(BUYERS).countDocuments({
        is_active: true,
        location: {
          $nearSphere: {
            $geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
            $maxDistance: SEARCH_RADIUS_KM * 1000,
          },
        },
      }),
      db.collection(MATCH_SESSIONS).countDocuments({
        region_cluster: regionCluster,
        category: input.category,
        status: { $in: ['searching', 'notifying'] },
      }),
      getDemandFactor(regionCluster, input.category),
    ]);

    return { nearbyBuyerCount, localSupplyCount, geoDemandIndex, regionCluster };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    log('warn', 'resolveGeoPricingFeatures failed (falling back to defaults)', { ...input, detail });
    return {};
  }
}
