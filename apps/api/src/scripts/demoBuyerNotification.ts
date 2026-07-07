// Hackathon demo — simulate "notify nearby buyers" end to end, against the real
// MongoDB matching engine (findCandidates → $nearSphere → rank → notify).
//
// Run:  pnpm --filter @reloop/api exec tsx src/scripts/demoBuyerNotification.ts
//
// What it does (idempotent — safe to re-run):
//   1. Seeds a pool of dummy local buyers around one Delhi pincode. The three
//      strongest candidates are tied to REAL demo accounts (user_meera /
//      user_rohan / user_ananya) so their notification is visible in-app: log in
//      as that user and the bell in the nav shows "A nearby return is available".
//   2. Inserts a dummy RETURN record at the same pincode (electronics, grade B).
//   3. Calls initiateMatchSession() — the real engine ranks the buyers, opens a
//      match_session, and notifies the #1 buyer (in-app + a server log line).
//   4. Prints the ranked candidates, who was notified, and the exact commands to
//      cascade to the next buyer (decline) or close the match (accept).

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
  type ConditionFloor,
} from '../lib/collections.js';
import { findCandidates, initiateMatchSession } from '../services/matchingEngine.js';

// ── Demo constants ────────────────────────────────────────────────────────────
const PINCODE = '110017'; // Delhi-South (present in regionCluster's PINCODE_TABLE)
const CATEGORY = 'electronics';
const RETURN_ID = 'DEMO-RET-NOTIFY-001';
const SELLER_ID = 'seller_techbazaar'; // gets the "matched!" ping when a buyer accepts
const BUYER_NOTIF_TITLE = 'A nearby return is available';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface DemoBuyerPlan {
  name: string;
  userId: string | null; // real account id → notification is visible in-app
  kmOffset: number; // rough distance from the return, in km
  daysInactive: number;
  intentSub: boolean; // true = subscribes to the category (intent 1.0)
  isRefurbisher: boolean;
}

// Top 3 are real accounts (visible in-app), ordered so ranking is deterministic:
// closest + most-recently-active wins. The rest are synthetic filler for realism.
const PLAN: DemoBuyerPlan[] = [
  { name: 'Meera Iyer', userId: 'user_meera', kmOffset: 0.0, daysInactive: 0, intentSub: true, isRefurbisher: false },
  { name: 'Rohan Verma', userId: 'user_rohan', kmOffset: 0.6, daysInactive: 1, intentSub: true, isRefurbisher: false },
  { name: 'Ananya Rao', userId: 'user_ananya', kmOffset: 1.2, daysInactive: 2, intentSub: true, isRefurbisher: false },
  { name: 'Demo Kabir', userId: null, kmOffset: 2.5, daysInactive: 6, intentSub: false, isRefurbisher: false },
  { name: 'Demo Sara', userId: null, kmOffset: 3.4, daysInactive: 10, intentSub: false, isRefurbisher: false },
  { name: 'Demo FixItPro (refurbisher)', userId: null, kmOffset: 4.1, daysInactive: 3, intentSub: false, isRefurbisher: true },
];

// ~0.009° latitude ≈ 1 km — convert a km offset into a coordinate nudge.
const KM_TO_DEG = 0.009;

function buildBuyer(plan: DemoBuyerPlan): BuyerDoc {
  const base = getPincodeCoordinates(PINCODE);
  const floor: ConditionFloor = plan.isRefurbisher ? 'Salvage' : 'C';
  return {
    user_id: plan.userId,
    name: plan.name,
    contact: plan.userId ? `${plan.userId}@example.com` : `+91-98${Math.floor(10000000 + Math.random() * 8e7)}`,
    notification_preference: plan.userId ? 'push' : 'sms',
    location: { type: 'Point', coordinates: [base.lng + plan.kmOffset * KM_TO_DEG, base.lat] },
    pincode: PINCODE,
    city: getCityForPincode(PINCODE),
    region_cluster: getRegionCluster(PINCODE),
    category_subscriptions: plan.intentSub ? [CATEGORY] : [],
    price_range: { min: 500, max: 25000 },
    condition_floor: floor,
    activity: {
      last_active: new Date(Date.now() - plan.daysInactive * 24 * 60 * 60 * 1000),
      // Filler buyers "viewed" the category once → weak intent (0.4) instead of 0.
      viewed_categories: plan.intentSub
        ? []
        : [{ category: CATEGORY, count: 1, last_viewed: new Date() }],
      completed_purchases: 3,
      avg_purchase_price: 6000,
    },
    is_refurbisher: plan.isRefurbisher,
    is_active: true,
    created_at: new Date(),
  };
}

async function main(): Promise<void> {
  if (!isMongoConfigured()) {
    console.error('[demo] MONGODB_URI not set in apps/api/.env — cannot run the matching demo.');
    process.exit(1);
  }

  const db = await getDb();
  await ensurePricingIndexes(db); // guarantees the 2dsphere index on buyers.location

  const runStart = new Date();
  const demoUserIds = PLAN.map((p) => p.userId).filter((id): id is string => id !== null);

  // 1) Reset any prior run of THIS demo (idempotent). Buyer notifications carry
  //    no return_id, so clear them by (account, title) instead.
  await db.collection<BuyerDoc>(BUYERS).deleteMany({ name: { $in: PLAN.map((p) => p.name) }, pincode: PINCODE });
  await db.collection(MATCH_SESSIONS).deleteMany({ return_id: RETURN_ID });
  await db.collection<ReturnRecordDoc>(RETURNS).deleteOne({ returnId: RETURN_ID });
  await db.collection(NOTIFICATIONS).deleteMany({ seller_id: { $in: demoUserIds }, title: BUYER_NOTIF_TITLE });

  // 2) Seed the dummy buyers.
  const buyers = PLAN.map(buildBuyer);
  await db.collection<BuyerDoc>(BUYERS).insertMany(buyers);
  console.log(`\n[demo] seeded ${buyers.length} buyers around pincode ${PINCODE} (${getCityForPincode(PINCODE)}).`);

  // 3) Insert the return record the engine will match.
  const now = new Date();
  const returnDoc: ReturnRecordDoc = {
    returnId: RETURN_ID,
    productName: 'Apple AirPods Pro (2nd Gen)',
    category: CATEGORY,
    region_cluster: getRegionCluster(PINCODE),
    pincode: PINCODE,
    base_price: 15000, // ₹15,000 market value (whole rupees)
    condition_score: 0.72, // → grade B
    grade: 'B',
    sku: 'B09AIRPODS2',
    seller_id: SELLER_ID,
    listing_created_at: now,
    pickup_deadline: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48h window
  };
  await db.collection<ReturnRecordDoc>(RETURNS).insertOne(returnDoc);
  console.log(`[demo] inserted return ${RETURN_ID} (${returnDoc.productName}, grade B) at ${PINCODE}.`);

  // 4) Show the ranked candidates (what the engine sees), then fire the match.
  const ranked = await findCandidates(RETURN_ID);
  console.log('\n[demo] ranked candidates (proximity·0.30 + intent·0.35 + priceFit·0.20 + recency·0.15):');
  ranked.forEach((c, i) => {
    const tag = c.buyer.user_id ? `  ⟵ in-app account: ${c.buyer.user_id}` : '';
    console.log(
      `  #${i + 1}  ${c.buyer.name.padEnd(28)} score=${c.matchScore.toFixed(2)}  ` +
        `(${c.distanceKm}km, intent=${c.intentScore}, price=${c.priceFitScore}, recency=${c.recencyScore})${tag}`,
    );
  });

  const session = await initiateMatchSession(RETURN_ID);
  const topBuyerId = session.candidate_list[session.current_candidate_index]?.buyer_id;
  const topBuyer = ranked.find((c) => c.buyer._id.equals(topBuyerId!))?.buyer;

  console.log(`\n[demo] ✅ match session ${session._id.toString()} opened — status: ${session.status}`);
  console.log(`[demo]    offered price: ₹${session.offered_price}`);

  // The buyer notification is written fire-and-forget inside the engine — poll
  // until it lands so the script doesn't exit (and kill it) prematurely.
  let landed = false;
  if (topBuyer?.user_id) {
    for (let i = 0; i < 20 && !landed; i++) {
      const n = await db
        .collection(NOTIFICATIONS)
        .findOne({ seller_id: topBuyer.user_id, title: BUYER_NOTIF_TITLE, created_at: { $gte: runStart } });
      landed = n !== null;
      if (!landed) await sleep(250);
    }
  }
  console.log(
    `[demo] 🔔 notified #1 buyer: ${topBuyer?.name}` +
      (topBuyer?.user_id
        ? ` — in-app notification ${landed ? 'DELIVERED ✅' : 'pending'} (log in as "${topBuyer.user_id.replace('user_', '')}")`
        : ' (log-line only — synthetic buyer, no account)'),
  );

  console.log('\n──────── try it ────────');
  console.log(`• See the notification in the UI: log in as "${(topBuyer?.user_id ?? 'user_meera').replace('user_', '')}" — the bell in the nav shows it.`);
  console.log(`• Seller map of candidates:   GET  /api/matching/status/${RETURN_ID}`);
  console.log(`• Decline → cascade to #2:    POST /api/matching/respond/${session._id.toString()}  { "buyerId": "${topBuyerId?.toString()}", "response": "declined" }`);
  console.log(`• Accept → close the match:   POST /api/matching/respond/${session._id.toString()}  { "buyerId": "${topBuyerId?.toString()}", "response": "accepted" }`);
  console.log('   (accepting also pings the seller\'s bell: "Matched with a local buyer!")\n');

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[demo] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
