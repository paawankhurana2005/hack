// Real (state, arm, reward) transaction persistence (spec 024, phase 7) — the
// durable half of the bridge into ml/pricing's offline retraining. Before
// this, every real reprice decision's outcome only ever became a structured
// `pricing.outcome` log LINE (console/CloudWatch) — nowhere a later export
// step could read it back from. Fire-and-forget, mirrors demandEvents.ts.

import { getDb, isMongoConfigured } from '../../lib/mongo.js';
import { log } from '../../lib/logger.js';
import { PRICING_TRANSACTIONS, type PricingTransactionDoc } from '../../lib/collections.js';

export function logPricingTransaction(doc: Omit<PricingTransactionDoc, 'created_at'>): void {
  if (!isMongoConfigured()) return;

  const full: PricingTransactionDoc = { ...doc, created_at: new Date() };

  void (async () => {
    try {
      const db = await getDb();
      await db.collection<PricingTransactionDoc>(PRICING_TRANSACTIONS).insertOne(full);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('warn', 'pricing transaction insert failed (dropped)', { listingId: doc.listing_id, detail });
    }
  })();
}
