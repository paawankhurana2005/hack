// Rich hackathon seed — gives EVERY demo user an in-app "nearby return" notification
// by running the real matching engine across several cities, and pings sellers with
// "Matched with a local buyer!" where a buyer accepts. One command populates the
// whole notification surface so any account you log into has a live bell.
//
// Run:  pnpm --filter @reloop/api demo:seed-notifications
//
// Idempotent: each scenario cleans up its own buyers / return / session / notifications
// before re-seeding.

import { ObjectId } from 'mongodb';
import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { getPincodeCoordinates, getCityForPincode, getRegionCluster } from '../lib/regionCluster.js';
import {
  BUYERS,
  RETURNS,
  MATCH_SESSIONS,
  NOTIFICATIONS,
  ensurePricingIndexes,
  type BuyerDoc,
  type ReturnRecordDoc,
} from '../lib/collections.js';
import { initiateMatchSession, recordBuyerResponse } from '../services/matchingEngine.js';

const BUYER_NOTIF_TITLE = 'A nearby return is available';
const NAME_PREFIX = 'Scenario';

interface Scenario {
  userId: string; // the account that receives the "nearby return" notification
  who: string; // display name
  pincode: string; // must exist in regionCluster's PINCODE_TABLE
  category: string;
  grade: 'A' | 'B';
  product: string;
  sku: string;
  basePrice: number; // whole rupees
  sellerId: string; // owns the return — pinged on accept
  accept: boolean; // simulate the buyer accepting → seller gets "Matched!"
}

// One scenario per demo user, spread across Delhi-NCR pincodes so each has its own
// candidate pool. The target user is always the #1 (closest + highest-intent) buyer.
const SCENARIOS: Scenario[] = [
  { userId: 'user_aarav', who: 'Aarav Shah', pincode: '110024', category: 'footwear', grade: 'A', product: "Nike Air Force 1 '07", sku: 'B08NIKEAF1', basePrice: 9695, sellerId: 'seller_urban', accept: false },
  { userId: 'user_meera', who: 'Meera Iyer', pincode: '110017', category: 'electronics', grade: 'A', product: 'Apple AirPods Pro (2nd Gen)', sku: 'B09AIRPODS', basePrice: 24900, sellerId: 'seller_techbazaar', accept: true },
  { userId: 'user_rohan', who: 'Rohan Verma', pincode: '110018', category: 'footwear', grade: 'B', product: 'Nike Dunk Low Retro', sku: 'B08NIKEDUNK', basePrice: 9295, sellerId: 'seller_urban', accept: false },
  { userId: 'user_ananya', who: 'Ananya Rao', pincode: '110007', category: 'apparel', grade: 'B', product: 'Nike Sportswear Club Hoodie', sku: 'B08NIKEHOOD', basePrice: 5495, sellerId: 'seller_urban', accept: false },
  { userId: 'user_kabir', who: 'Kabir Nair', pincode: '201301', category: 'electronics', grade: 'A', product: 'Samsung Galaxy S23 Ultra', sku: 'B09GALAXY', basePrice: 124999, sellerId: 'seller_techbazaar', accept: false },
  { userId: 'user_diya', who: 'Diya Menon', pincode: '122001', category: 'home', grade: 'B', product: 'Stanley Quencher Tumbler', sku: 'B07STANLEY', basePrice: 3999, sellerId: 'seller_techbazaar', accept: false },
  { userId: 'user_ishaan', who: 'Ishaan Gupta', pincode: '110019', category: 'footwear', grade: 'B', product: 'Nike Air Max 90', sku: 'B08NIKEAM90', basePrice: 10995, sellerId: 'seller_urban', accept: true },
  { userId: 'user_priya', who: 'Priya Reddy', pincode: '122002', category: 'apparel', grade: 'B', product: 'Nike Sportswear Club Tee', sku: 'B08NIKETEE', basePrice: 2195, sellerId: 'seller_urban', accept: false },
];

const KM_TO_DEG = 0.009;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildBuyer(
  s: Scenario,
  opts: { name: string; userId: string | null; kmOffset: number; daysInactive: number; strongIntent: boolean; refurb?: boolean },
): BuyerDoc {
  const base = getPincodeCoordinates(s.pincode);
  return {
    user_id: opts.userId,
    name: opts.name,
    contact: opts.userId ? `${opts.userId}@example.com` : `+91-98${Math.floor(10000000 + Math.random() * 8e7)}`,
    notification_preference: opts.userId ? 'push' : 'sms',
    location: { type: 'Point', coordinates: [base.lng + opts.kmOffset * KM_TO_DEG, base.lat] },
    pincode: s.pincode,
    city: getCityForPincode(s.pincode),
    region_cluster: getRegionCluster(s.pincode),
    category_subscriptions: opts.strongIntent ? [s.category] : [],
    price_range: { min: 500, max: opts.strongIntent ? 200000 : 5000 },
    condition_floor: opts.refurb ? 'Salvage' : 'C',
    activity: {
      last_active: new Date(Date.now() - opts.daysInactive * 24 * 60 * 60 * 1000),
      viewed_categories: opts.strongIntent ? [] : [{ category: s.category, count: 1, last_viewed: new Date() }],
      completed_purchases: 3,
      avg_purchase_price: 6000,
    },
    is_refurbisher: Boolean(opts.refurb),
    is_active: true,
    created_at: new Date(),
  };
}

async function runScenario(s: Scenario, idx: number): Promise<{ notified: boolean; matched: boolean }> {
  const db = await getDb();
  const returnId = `DEMO-SC-${idx + 1}`;
  const namePrefix = `${NAME_PREFIX} ${idx + 1}`;
  const runStart = new Date();

  // Clean up this scenario's prior run.
  await db.collection<BuyerDoc>(BUYERS).deleteMany({ name: { $regex: `^${namePrefix} ` }, pincode: s.pincode });
  await db.collection(MATCH_SESSIONS).deleteMany({ return_id: returnId });
  await db.collection<ReturnRecordDoc>(RETURNS).deleteOne({ returnId });
  await db.collection(NOTIFICATIONS).deleteMany({ seller_id: s.userId, title: BUYER_NOTIF_TITLE });

  // Target buyer (the user account) is closest + highest-intent → ranks #1.
  const buyers: BuyerDoc[] = [
    buildBuyer(s, { name: `${namePrefix} ${s.who}`, userId: s.userId, kmOffset: 0, daysInactive: 0, strongIntent: true }),
    buildBuyer(s, { name: `${namePrefix} Filler A`, userId: null, kmOffset: 2.2, daysInactive: 6, strongIntent: false }),
    buildBuyer(s, { name: `${namePrefix} Filler B`, userId: null, kmOffset: 3.5, daysInactive: 11, strongIntent: false }),
    buildBuyer(s, { name: `${namePrefix} Refurbisher`, userId: null, kmOffset: 4.4, daysInactive: 3, strongIntent: false, refurb: true }),
  ];
  await db.collection<BuyerDoc>(BUYERS).insertMany(buyers);

  const now = new Date();
  const conditionScore = s.grade === 'A' ? 0.9 : 0.72;
  const returnDoc: ReturnRecordDoc = {
    returnId,
    productName: s.product,
    category: s.category,
    region_cluster: getRegionCluster(s.pincode),
    pincode: s.pincode,
    base_price: s.basePrice,
    condition_score: conditionScore,
    grade: s.grade,
    sku: s.sku,
    seller_id: s.sellerId,
    listing_created_at: now,
    pickup_deadline: new Date(now.getTime() + 48 * 60 * 60 * 1000),
  };
  await db.collection<ReturnRecordDoc>(RETURNS).insertOne(returnDoc);

  // Real matching engine: rank + open session + notify the #1 buyer.
  const session = await initiateMatchSession(returnId);
  const topCandidate = session.candidate_list[session.current_candidate_index];

  // The buyer notification is written fire-and-forget — poll until it lands.
  let notified = false;
  for (let i = 0; i < 20 && !notified; i++) {
    const n = await db.collection(NOTIFICATIONS).findOne({ seller_id: s.userId, title: BUYER_NOTIF_TITLE, created_at: { $gte: runStart } });
    notified = n !== null;
    if (!notified) await sleep(200);
  }

  // Optionally simulate the buyer accepting → seller gets "Matched with a local buyer!".
  let matched = false;
  if (s.accept && topCandidate) {
    await recordBuyerResponse(session._id.toString(), topCandidate.buyer_id.toString(), 'accepted');
    const closed = await db.collection(MATCH_SESSIONS).findOne({ _id: new ObjectId(session._id.toString()) });
    matched = closed?.status === 'matched';
  }

  return { notified, matched };
}

async function main(): Promise<void> {
  if (!isMongoConfigured()) {
    console.error('[seed] MONGODB_URI not set in apps/api/.env — cannot seed the notification demo.');
    process.exit(1);
  }
  const db = await getDb();
  await ensurePricingIndexes(db);

  console.log(`\n[seed] seeding ${SCENARIOS.length} local-match scenarios (one per user)…\n`);
  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i]!;
    const { notified, matched } = await runScenario(s, i);
    const bell = notified ? '🔔 notified' : '…  pending';
    const sellerPing = matched ? `  +  ✅ seller ${s.sellerId.replace('seller_', '')} matched` : '';
    console.log(`  ${bell}  ${s.who.padEnd(13)} (${s.userId.replace('user_', '').padEnd(7)}) — ${s.product} in ${getCityForPincode(s.pincode)}${sellerPing}`);
  }

  console.log('\n[seed] done. Log in as any of these users — the nav bell shows their nearby-return notification.');
  console.log('       Sellers pinged on accept: log in as "techbazaar" / "urbanthread" to see "Matched with a local buyer!".\n');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
