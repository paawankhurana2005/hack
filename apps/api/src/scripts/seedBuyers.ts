// Seed script — synthetic local buyers spread across Delhi NCR so the matching
// engine (findCandidates / $nearSphere) has a real candidate pool to search.
//
// Run standalone:  pnpm --filter @reloop/api seed:buyers
//             or:  pnpm --filter @reloop/api exec tsx src/scripts/seedBuyers.ts
//
// Idempotent: wipes the buyers at the pincodes this script owns, then
// re-inserts, so it can be run repeatedly.

import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { getRegionCluster, getPincodeCoordinates, getCityForPincode } from '../lib/regionCluster.js';
import { BUYERS, ensurePricingIndexes, type BuyerDoc, type ConditionFloor } from '../lib/collections.js';

interface ZonePlan {
  city: string;
  pincodes: string[];
  buyerCount: number;
  hasRefurbisher: boolean;
}

// Delhi NCR zones — pincodes here match the entries added to regionCluster.ts's
// PINCODE_TABLE, so getPincodeCoordinates/getCityForPincode resolve exactly.
const ZONES: ZonePlan[] = [
  { city: 'Delhi-South', pincodes: ['110017', '110019', '110024', '110049', '110062'], buyerCount: 6, hasRefurbisher: true },
  { city: 'Delhi-West', pincodes: ['110018', '110026', '110058', '110064'], buyerCount: 5, hasRefurbisher: true },
  { city: 'Delhi-North', pincodes: ['110007', '110009', '110033', '110054'], buyerCount: 5, hasRefurbisher: false },
  { city: 'NCR-Noida', pincodes: ['201301', '201304', '201310'], buyerCount: 5, hasRefurbisher: true },
  { city: 'NCR-Gurgaon', pincodes: ['122001', '122002', '122009', '122018'], buyerCount: 5, hasRefurbisher: true },
];

const CATEGORIES = ['electronics', 'apparel', 'furniture'] as const;
const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
  'Kabir', 'Aryan', 'Ananya', 'Diya', 'Aadhya', 'Myra', 'Sara', 'Isha', 'Kiara', 'Zara', 'Neha', 'Priya',
];
const NOTIFICATION_PREFS: BuyerDoc['notification_preference'][] = ['sms', 'email', 'push'];
const REGULAR_FLOORS: ConditionFloor[] = ['A', 'B', 'C'];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickSubset<T>(arr: readonly T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function jitter(value: number, magnitudeDeg: number): number {
  return value + (Math.random() * 2 - 1) * magnitudeDeg;
}

function randomPriceRange(): { min: number; max: number } {
  const min = 500 + Math.floor(Math.random() * 1500); // 500–2000
  const max = Math.min(5000, min + 500 + Math.floor(Math.random() * 3000)); // up to 5000
  return { min, max };
}

function randomLastActive(): Date {
  const daysAgo = Math.floor(Math.random() * 30); // spread across last 30 days
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
}

function buildBuyer(zone: ZonePlan, index: number, isRefurbisher: boolean): BuyerDoc {
  const pincode = pick(zone.pincodes);
  const base = getPincodeCoordinates(pincode);
  // Small jitter (~0.01deg ≈ 1km) so buyers in the same pincode aren't stacked
  // on the exact same point — still well within the zone's geographic bounds.
  const lat = jitter(base.lat, 0.01);
  const lng = jitter(base.lng, 0.01);

  const name = `${pick(FIRST_NAMES)} ${zone.city} ${index}`;
  const notification_preference = pick(NOTIFICATION_PREFS);
  const contact =
    notification_preference === 'email'
      ? `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`
      : `+91-98${Math.floor(10000000 + Math.random() * 89999999)}`;

  return {
    user_id: null,
    name,
    contact,
    notification_preference,
    location: { type: 'Point', coordinates: [lng, lat] },
    pincode,
    city: getCityForPincode(pincode),
    region_cluster: getRegionCluster(pincode),
    category_subscriptions: isRefurbisher ? [] : pickSubset(CATEGORIES, 1 + Math.floor(Math.random() * 2)),
    price_range: randomPriceRange(),
    // Refurbishers accept any condition — represented as a Salvage floor so
    // they stay in the match pool for C/Salvage items regardless of grade.
    condition_floor: isRefurbisher ? 'Salvage' : pick(REGULAR_FLOORS),
    activity: {
      last_active: randomLastActive(),
      viewed_categories: [],
      completed_purchases: Math.floor(Math.random() * 10),
      avg_purchase_price: 500 + Math.floor(Math.random() * 4000),
    },
    is_refurbisher: isRefurbisher,
    is_active: true,
    created_at: new Date(),
  };
}

async function seed(): Promise<void> {
  if (!isMongoConfigured()) {
    // eslint-disable-next-line no-console
    console.error('[seed] MONGODB_URI not configured — set it in apps/api/.env');
    process.exit(1);
  }

  const db = await getDb();
  await ensurePricingIndexes(db);

  const buyersCol = db.collection<BuyerDoc>(BUYERS);
  const allPincodes = ZONES.flatMap((z) => z.pincodes);
  await buyersCol.deleteMany({ pincode: { $in: allPincodes } });

  const buyers: BuyerDoc[] = [];
  for (const zone of ZONES) {
    for (let i = 1; i <= zone.buyerCount; i++) {
      // The single designated refurbisher for this zone is buyer #1.
      const isRefurbisher = zone.hasRefurbisher && i === 1;
      buyers.push(buildBuyer(zone, i, isRefurbisher));
    }
  }

  await buyersCol.insertMany(buyers);

  // eslint-disable-next-line no-console
  console.log(`[seed] inserted ${buyers.length} buyers across ${ZONES.length} zones:\n`);
  for (const zone of ZONES) {
    const zoneBuyers = buyers.filter((b) => b.city === zone.city);
    // eslint-disable-next-line no-console
    console.log(`  ${zone.city} (${zoneBuyers.length} buyers)`);
    for (const b of zoneBuyers) {
      const subs = b.is_refurbisher ? '[refurbisher — accepts all categories]' : b.category_subscriptions.join(', ');
      // eslint-disable-next-line no-console
      console.log(`    - ${b.name}: ${subs} | floor=${b.condition_floor} | ₹${b.price_range.min}-${b.price_range.max}`);
    }
  }

  process.exit(0);
}

seed().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
