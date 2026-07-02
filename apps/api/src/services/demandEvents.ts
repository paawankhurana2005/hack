// Demand event capture — the write path that feeds the demand index.
//
// Fire-and-forget by design: logging a buyer signal must NEVER slow down or fail
// the request that triggered it. Every insert is wrapped so a DB hiccup (or no
// MongoDB at all) just drops the event with a logged warning — the caller is
// never blocked and never sees an error.

import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { log } from '../lib/logger.js';
import { getRegionCluster } from '../lib/regionCluster.js';
import {
  DEMAND_EVENTS,
  EVENT_WEIGHTS,
  type DemandEventDoc,
  type DemandEventType,
} from '../lib/collections.js';

/**
 * Record a single buyer-activity signal. Returns immediately; the actual insert
 * runs detached. Callers should NOT await this for correctness — it is purely a
 * side-effect on the analytics path.
 */
export function logDemandEvent(
  eventType: DemandEventType,
  category: string,
  pincode: string,
): void {
  // No DB configured → silently skip (e.g. local dev without Atlas). Never throw.
  if (!isMongoConfigured()) return;

  const doc: DemandEventDoc = {
    event_type: eventType,
    category,
    region_cluster: getRegionCluster(pincode),
    pincode,
    timestamp: new Date(),
    weight: EVENT_WEIGHTS[eventType],
  };

  // Detached insert. We intentionally do not return the promise so callers can't
  // accidentally block on it; failures are swallowed after logging.
  void (async () => {
    try {
      const db = await getDb();
      await db.collection<DemandEventDoc>(DEMAND_EVENTS).insertOne(doc);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('warn', 'demand event insert failed (dropped)', {
        eventType,
        category,
        region_cluster: doc.region_cluster,
        detail,
      });
    }
  })();
}
