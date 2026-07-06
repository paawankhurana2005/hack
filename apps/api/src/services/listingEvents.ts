// Per-listing engagement event capture (spec 024, phase 3) — mirrors
// demandEvents.ts's fire-and-forget write path and TTL convention, but keyed
// by listing_id instead of region_cluster/pincode, since a "listing" has no
// other server-side record (CasualListing lives only in browser localStorage).
//
// Before this, PricingStateVector's demand-signal group (viewVelocity24h,
// saveRate, ctr, messageCount, cartAbandons) was fed entirely by
// agent-store.ts's client-side simulation (simulateDailyViews) — real numbers
// nowhere. This captures the interactions that ARE real today (a shop-page
// visit, a Rufus question) and aggregates them at read time; `save`/
// `cart_abandon` have no real UI signal yet (no wishlist/cart feature exists
// in this app) and stay on their prior defaults — an honest gap, not faked.

import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { log } from '../lib/logger.js';
import { LISTING_EVENTS, type ListingEventDoc, type ListingEventType } from '../lib/collections.js';

/** Record a single listing-engagement signal. Fire-and-forget — a logging
 *  failure (or no MongoDB at all) must never affect the caller. */
export function logListingEvent(listingId: string, eventType: ListingEventType): void {
  if (!isMongoConfigured()) return;

  const doc: ListingEventDoc = { listing_id: listingId, event_type: eventType, timestamp: new Date() };

  void (async () => {
    try {
      const db = await getDb();
      await db.collection<ListingEventDoc>(LISTING_EVENTS).insertOne(doc);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('warn', 'listing event insert failed (dropped)', { listingId, eventType, detail });
    }
  })();
}

export interface EngagementFeatures {
  viewVelocity24h?: number;
  viewVelocityTrend?: number;
  ctr?: number;
  messageCount?: number;
}

/** Real engagement for one listing, aggregated live at read time (cheap —
 *  per-listing row counts, not a whole-catalog rollup, so no batch job is
 *  needed the way demand_index's cron is). Returns `{}` (no-op) when Mongo
 *  isn't configured or the listing has zero events, so the reprice engine's
 *  existing placeholder defaults remain the safety net. */
export async function getListingEngagement(listingId: string): Promise<EngagementFeatures> {
  if (!isMongoConfigured()) return {};

  try {
    const db = await getDb();
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const sincePrior24h = new Date(now - 48 * 60 * 60 * 1000);

    const [views24h, viewsPrior24h, messages, allEvents] = await Promise.all([
      db.collection<ListingEventDoc>(LISTING_EVENTS).countDocuments({
        listing_id: listingId,
        event_type: 'view',
        timestamp: { $gte: since24h },
      }),
      db.collection<ListingEventDoc>(LISTING_EVENTS).countDocuments({
        listing_id: listingId,
        event_type: 'view',
        timestamp: { $gte: sincePrior24h, $lt: since24h },
      }),
      db.collection<ListingEventDoc>(LISTING_EVENTS).countDocuments({
        listing_id: listingId,
        event_type: 'message',
        timestamp: { $gte: since24h },
      }),
      db.collection<ListingEventDoc>(LISTING_EVENTS).countDocuments({ listing_id: listingId }),
    ]);

    if (allEvents === 0) return {};

    return {
      viewVelocity24h: views24h,
      // Ratio vs. the prior 24h window (PricingStateVector's documented shape);
      // undefined (→ default) rather than a divide-by-zero when there's no
      // prior-window baseline yet.
      viewVelocityTrend: viewsPrior24h > 0 ? views24h / viewsPrior24h : undefined,
      // messages/views proxy for click-through — genuine "did they engage
      // further" signal, cheaper than instrumenting real ad-style clicks.
      ctr: views24h > 0 ? Math.min(1, messages / views24h) : undefined,
      messageCount: messages,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    log('warn', 'getListingEngagement failed (falling back to defaults)', { listingId, detail });
    return {};
  }
}
