// Seed script — synthetic demand events + sample return records so the
// aggregation job and pricing engine can be exercised end-to-end without real
// buyer traffic or the (not-yet-wired) AI grading model.
//
// Run standalone:  pnpm --filter @reloop/api seed:demand
//             or:  pnpm --filter @reloop/api exec tsx src/scripts/seedDemandEvents.ts
//
// Idempotent: it wipes the synthetic events and the RET-PRICE-TEST-* records it
// owns, then re-inserts, so you can run it repeatedly.

import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { getRegionCluster } from '../lib/regionCluster.js';
import {
  DEMAND_EVENTS,
  RETURNS,
  EVENT_WEIGHTS,
  ensurePricingIndexes,
  type DemandEventDoc,
  type DemandEventType,
  type ReturnRecordDoc,
} from '../lib/collections.js';

const WINDOW_DAYS = 7;

// PIN codes for the three hotspot zones (→ Delhi-NCR / Bengaluru / Mumbai).
const HOTSPOTS = [
  { pincode: '110001', label: 'Delhi-NCR' },
  { pincode: '560001', label: 'Bengaluru' },
  { pincode: '400001', label: 'Mumbai' },
] as const;

const CATEGORIES = ['electronics', 'apparel'] as const;

// Per zone × category: how many events to emit and the event-type mix (its
// "heat"). Hotter cells skew toward high-weight signals (interest/match), so
// after normalization their demand factor lands above the per-category average.
interface CellPlan {
  count: number;
  mix: DemandEventType[]; // sampled uniformly; repeat a type to weight it
}

const HOT: DemandEventType[] = ['match_completed', 'interest', 'interest', 'view', 'view', 'search'];
const WARM: DemandEventType[] = ['interest', 'view', 'view', 'search', 'search'];
const COOL: DemandEventType[] = ['view', 'search', 'search', 'search'];

const PLAN: Record<string, Record<string, CellPlan>> = {
  'Delhi-NCR': {
    electronics: { count: 45, mix: WARM },
    apparel: { count: 55, mix: HOT },
  },
  Bengaluru: {
    electronics: { count: 60, mix: HOT },
    apparel: { count: 40, mix: WARM },
  },
  Mumbai: {
    electronics: { count: 50, mix: COOL },
    apparel: { count: 35, mix: WARM },
  },
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomTimestampInWindow(): Date {
  const ms = Math.random() * WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms);
}

async function seed(): Promise<void> {
  if (!isMongoConfigured()) {
    // eslint-disable-next-line no-console
    console.error('[seed] MONGODB_URI not configured — set it in apps/api/.env');
    process.exit(1);
  }

  const db = await getDb();
  await ensurePricingIndexes(db);

  // ── demand_events ──────────────────────────────────────────────────────────
  const eventsCol = db.collection<DemandEventDoc>(DEMAND_EVENTS);
  // Clear only the synthetic categories/pincodes this script owns.
  await eventsCol.deleteMany({
    pincode: { $in: HOTSPOTS.map((h) => h.pincode) },
    category: { $in: [...CATEGORIES] },
  });

  const events: DemandEventDoc[] = [];
  for (const { pincode } of HOTSPOTS) {
    const cluster = getRegionCluster(pincode);
    for (const category of CATEGORIES) {
      const plan = PLAN[cluster]?.[category];
      if (!plan) continue;
      for (let i = 0; i < plan.count; i++) {
        const eventType = pick(plan.mix);
        events.push({
          event_type: eventType,
          category,
          region_cluster: cluster,
          pincode,
          timestamp: randomTimestampInWindow(),
          weight: EVENT_WEIGHTS[eventType],
        });
      }
    }
  }
  await eventsCol.insertMany(events);

  // ── sample return records (varied condition_score) ─────────────────────────
  // Same category/region/base_price/urgency window across all four so the only
  // thing that moves the price is condition — lets us sanity-check that curve.
  const now = Date.now();
  const listingCreatedAt = new Date(now - 12 * 60 * 60 * 1000); // 12h ago
  const pickupDeadline = new Date(now + 36 * 60 * 60 * 1000); // 36h left (48h window)

  const sampleReturns: ReturnRecordDoc[] = [
    { score: 0.9, id: 'RET-PRICE-TEST-A' },
    { score: 0.7, id: 'RET-PRICE-TEST-B' },
    { score: 0.45, id: 'RET-PRICE-TEST-C' },
    { score: 0.15, id: 'RET-PRICE-TEST-D' },
  ].map(({ score, id }) => ({
    returnId: id,
    productName: `Pricing test unit (cond ${score})`,
    category: 'electronics',
    region_cluster: 'Bengaluru',
    pincode: '560001',
    base_price: 50000,
    condition_score: score,
    pickup_deadline: pickupDeadline,
    listing_created_at: listingCreatedAt,
    grade: null,
    sku: 'B09TESTSKU',
  }));

  // Mirror the three seeded rescue-pipeline items (exchange-store.ts EXCHANGE_ITEMS)
  // so their rescue pages show a live engine price out of the box. Varied urgency
  // windows so the urgency factor visibly differs between them.
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000);
  const plusHours = (start: Date, h: number) => new Date(start.getTime() + h * 60 * 60 * 1000);
  const seededRescueSources: Array<{
    returnId: string;
    productName: string;
    basePriceRupees: number;
    grade: 'A' | 'B';
    startedHoursAgo: number;
    windowHours: number;
  }> = [
    { returnId: 'RET-2026-800001', productName: 'Fire HD 10 Tablet (32GB)', basePriceRupees: 6999, grade: 'A', startedHoursAgo: 8, windowHours: 48 },
    { returnId: 'RET-2026-EX002', productName: 'Sony WH-1000XM5 Headphones', basePriceRupees: 29999, grade: 'B', startedHoursAgo: 19, windowHours: 36 },
    { returnId: 'RET-2026-EX003', productName: 'Samsung Galaxy S24 FE', basePriceRupees: 49999, grade: 'B', startedHoursAgo: 38, windowHours: 48 },
  ];
  const seededRescueReturns: ReturnRecordDoc[] = seededRescueSources.map((s) => {
    const listingCreated = hoursAgo(s.startedHoursAgo);
    return {
      returnId: s.returnId,
      productName: s.productName,
      category: 'electronics',
      region_cluster: 'Bengaluru',
      pincode: '560001',
      base_price: s.basePriceRupees,
      condition_score: 0.7, // placeholder until AI grading is wired in
      pickup_deadline: plusHours(listingCreated, s.windowHours),
      listing_created_at: listingCreated,
      grade: s.grade,
      sku: 'B09SEEDED',
    };
  });

  const returnsCol = db.collection<ReturnRecordDoc>(RETURNS);
  for (const rec of [...sampleReturns, ...seededRescueReturns]) {
    await returnsCol.updateOne({ returnId: rec.returnId }, { $set: rec }, { upsert: true });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed] inserted ${events.length} demand events across ${HOTSPOTS.length} zones × ${CATEGORIES.length} categories; ` +
      `upserted ${sampleReturns.length} test return records (RET-PRICE-TEST-A..D) + ` +
      `${seededRescueReturns.length} rescue-pipeline records (RET-2026-800001 / EX002 / EX003).`,
  );
  process.exit(0);
}

seed().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
