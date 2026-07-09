// Hackathon demo — Rohan returns his blue Nike Dunk Low Retro ("White / Armory
// Navy"), the local-routing engine ranks nearby sneaker buyers, and the offer
// cascades to them IN PRIORITY ORDER so you can log into each buyer account and
// show "he was #1 → notified first, she was #2 → notified second, …".
//
// Run:  pnpm --filter @reloop/api demo:blue-dunk
//
// This script leaves the database in a SINGLE-STORY state — after it runs, the
// only notifications that exist anywhere are the three for this return.
//
// What it does (idempotent — safe to re-run):
//   1. WIPES the notifications collection (every buyer AND both sellers).
//   2. RETIRES every other match session by setting status:'expired'. Necessary,
//      not cosmetic: the matching-cascade cron (jobs/matchingCascade.ts) sweeps
//      every session still in 'notifying' or 'searching' and pings more buyers,
//      which would silently reintroduce unrelated notifications minutes after
//      this script finishes. Nothing is deleted — the other demos' sessions stay
//      on disk and can be revived by re-running their own seed scripts.
//   3. Seeds a realistic pool of local sneaker buyers around one Delhi pincode.
//      The three strongest candidates are REAL demo accounts (aarav / ishaan /
//      priya) so their in-app bell actually lights up when you log in.
//   4. Inserts the return: Nike Dunk Low Retro, grade A, condition_score 0.918 —
//      the score our own ai-grading model actually produced for these photos.
//   5. Runs the real engine (findCandidates → $nearSphere → 4-factor rank) and
//      writes the ranked candidate_list onto the match session. That list is the
//      priority order you present from.
//   6. Cascades: #1 passes → #2 notified, #2 passes → #3 notified. #3 is left
//      PENDING so you can accept it live on stage.
//   7. Sweeps any seller-side notification the cascade emitted, so the only docs
//      left are the three buyer offers for THIS return.

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
  type MatchSessionDoc,
  type NotificationDoc,
} from '../lib/collections.js';
import { findCandidates, initiateMatchSession, recordBuyerResponse } from '../services/matchingEngine.js';

// ── Demo constants ────────────────────────────────────────────────────────────
const PINCODE = '110017'; // Delhi-South (present in regionCluster's PINCODE_TABLE)
const CATEGORY = 'footwear';
const RETURN_ID = 'DEMO-BLUE-DUNK-001';
const SELLER_ID = 'seller_urban'; // UrbanThread — footwear seller; pinged on accept
const PRODUCT = 'Nike Dunk Low Retro — White / Armory Navy';
const SKU = 'B08NIKEDUNK11';
const BASE_PRICE = 9_295; // ₹ market value (whole rupees), matches owned-items.ts
// The real condition score ai-grading/serve.py returned for shoesDemo/*.jpg.
const CONDITION_SCORE = 0.918;
const GRADE = 'A' as const;
const BUYER_NOTIF_TITLE = 'A nearby return is available';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface DemoBuyerPlan {
  name: string;
  userId: string | null; // real account id → notification is visible in-app + login
  handle: string | null;
  password: string | null;
  kmOffset: number; // rough distance from the return, in km
  daysInactive: number;
  strongIntent: boolean; // true = subscribes to footwear (intent 1.0)
  isRefurbisher: boolean;
}

// Top 3 are real accounts and are ordered so the ranking is deterministic: all
// three are strong-intent footwear buyers, so proximity + recency break the tie
// — closest & most-recently-active wins. The rest are synthetic filler.
const PLAN: DemoBuyerPlan[] = [
  { name: 'Aarav Shah', userId: 'user_aarav', handle: 'aarav', password: 'aarav123', kmOffset: 0.3, daysInactive: 0, strongIntent: true, isRefurbisher: false },
  { name: 'Ishaan Gupta', userId: 'user_ishaan', handle: 'ishaan', password: 'ishaan123', kmOffset: 1.1, daysInactive: 1, strongIntent: true, isRefurbisher: false },
  { name: 'Priya Reddy', userId: 'user_priya', handle: 'priya', password: 'priya123', kmOffset: 2.0, daysInactive: 2, strongIntent: true, isRefurbisher: false },
  { name: 'Kabir Sneakerhead', userId: null, handle: null, password: null, kmOffset: 3.2, daysInactive: 7, strongIntent: false, isRefurbisher: false },
  { name: 'Sara Kicks', userId: null, handle: null, password: null, kmOffset: 4.0, daysInactive: 12, strongIntent: false, isRefurbisher: false },
  { name: 'SoleRevive Refurb', userId: null, handle: null, password: null, kmOffset: 4.6, daysInactive: 3, strongIntent: false, isRefurbisher: true },
];

// ~0.009° latitude ≈ 1 km — convert a km offset into a coordinate nudge.
const KM_TO_DEG = 0.009;

function buildBuyer(plan: DemoBuyerPlan): BuyerDoc {
  const base = getPincodeCoordinates(PINCODE);
  const floor: ConditionFloor = plan.isRefurbisher ? 'Salvage' : 'B';
  return {
    user_id: plan.userId,
    name: plan.name,
    contact: plan.userId ? `${plan.handle}@example.com` : `+91-98${Math.floor(10000000 + Math.random() * 8e7)}`,
    notification_preference: plan.userId ? 'push' : 'sms',
    location: { type: 'Point', coordinates: [base.lng + plan.kmOffset * KM_TO_DEG, base.lat] },
    pincode: PINCODE,
    city: getCityForPincode(PINCODE),
    region_cluster: getRegionCluster(PINCODE),
    category_subscriptions: plan.strongIntent ? [CATEGORY] : [],
    // Strong-intent buyers have headroom above the offered price so they pass the
    // price filter; filler buyers still "viewed" footwear once → weak intent.
    price_range: { min: 500, max: plan.strongIntent ? 50_000 : 6_000 },
    condition_floor: floor,
    activity: {
      last_active: new Date(Date.now() - plan.daysInactive * 24 * 60 * 60 * 1000),
      viewed_categories: plan.strongIntent ? [] : [{ category: CATEGORY, count: 1, last_viewed: new Date() }],
      completed_purchases: 4,
      avg_purchase_price: 8_000,
    },
    is_refurbisher: plan.isRefurbisher,
    is_active: true,
    created_at: new Date(),
  };
}

/** Poll until this account's nearby-return notification has landed (it's written
 *  fire-and-forget inside the engine). Returns the moment it was created. */
async function waitForNotification(userId: string, since: Date): Promise<Date | null> {
  const db = await getDb();
  for (let i = 0; i < 25; i++) {
    const n = await db
      .collection<NotificationDoc>(NOTIFICATIONS)
      .findOne({ seller_id: userId, title: BUYER_NOTIF_TITLE, created_at: { $gte: since } });
    if (n) return n.created_at;
    await sleep(200);
  }
  return null;
}

function fmtTime(d: Date | null): string {
  return d ? d.toLocaleTimeString('en-IN', { hour12: false }) : '—';
}

async function main(): Promise<void> {
  if (!isMongoConfigured()) {
    console.error('[dunk] MONGODB_URI not set in apps/api/.env — cannot run the demo.');
    process.exit(1);
  }

  const db = await getDb();
  await ensurePricingIndexes(db); // guarantees the 2dsphere index on buyers.location

  const runStart = new Date();

  // 1) Reset. Notifications are wiped globally so this return is the only story
  //    in the database. Other match sessions are RETIRED, not deleted — see the
  //    header for why they can't just be left alone.
  const notifsBefore = await db.collection(NOTIFICATIONS).countDocuments();
  await db.collection(NOTIFICATIONS).deleteMany({});

  const retired = await db
    .collection<MatchSessionDoc>(MATCH_SESSIONS)
    .updateMany(
      { return_id: { $ne: RETURN_ID }, status: { $in: ['notifying', 'searching'] } },
      { $set: { status: 'expired', updated_at: new Date() } },
    );

  // This return's own session is rebuilt from scratch each run.
  await db.collection(MATCH_SESSIONS).deleteOne({ return_id: RETURN_ID });
  await db.collection<BuyerDoc>(BUYERS).deleteMany({ name: { $in: PLAN.map((p) => p.name) }, pincode: PINCODE });
  await db.collection<ReturnRecordDoc>(RETURNS).deleteOne({ returnId: RETURN_ID });

  // seedDemoScenario.ts left buyers named "Scenario N <Person>" bound to the same
  // real accounts as our demo trio. They out-rank the filler buyers and show up as
  // duplicate names in the priority list. Park them (reversible: re-run that seed).
  const parked = await db
    .collection<BuyerDoc>(BUYERS)
    .updateMany({ name: /^Scenario /, is_active: true }, { $set: { is_active: false } });

  console.log(
    `\n[dunk] wiped ${notifsBefore} notification(s); retired ${retired.modifiedCount} live match session(s); ` +
      `parked ${parked.modifiedCount} leftover scenario buyer(s). Nothing deleted.`,
  );

  // 2) Seed the local sneaker-buyer pool.
  const buyers = PLAN.map(buildBuyer);
  await db.collection<BuyerDoc>(BUYERS).insertMany(buyers);
  console.log(`[dunk] seeded ${buyers.length} local buyers around ${PINCODE} (${getCityForPincode(PINCODE)}).`);

  // 3) Insert the return — Rohan's blue Dunks.
  const now = new Date();
  const returnDoc: ReturnRecordDoc = {
    returnId: RETURN_ID,
    productName: PRODUCT,
    category: CATEGORY,
    region_cluster: getRegionCluster(PINCODE),
    pincode: PINCODE,
    base_price: BASE_PRICE,
    condition_score: CONDITION_SCORE,
    grade: GRADE,
    sku: SKU,
    seller_id: SELLER_ID,
    listing_created_at: now,
    pickup_deadline: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 48h window
  };
  await db.collection<ReturnRecordDoc>(RETURNS).insertOne(returnDoc);
  console.log(`[dunk] inserted return ${RETURN_ID} — ${PRODUCT} (grade ${GRADE}, score ${CONDITION_SCORE}).`);

  // 4) Show the ranked candidates (what the engine sees).
  const ranked = await findCandidates(RETURN_ID);
  console.log('\n[dunk] ranked candidates (proximity·0.30 + intent·0.35 + priceFit·0.20 + recency·0.15):');
  ranked.forEach((c, i) => {
    const tag = c.buyer.user_id ? `  ⟵ login: ${c.buyer.user_id.replace('user_', '')}` : '';
    console.log(
      `  #${i + 1}  ${c.buyer.name.padEnd(22)} score=${c.matchScore.toFixed(2)}  ` +
        `(${c.distanceKm}km, intent=${c.intentScore}, price=${c.priceFitScore}, recency=${c.recencyScore})${tag}`,
    );
  });

  // 5) Open the session (notifies #1), then cascade the offer down the ranking.
  const session = await initiateMatchSession(RETURN_ID);
  const sessionId = session._id.toString();
  console.log(`\n[dunk] ✅ match session ${sessionId} opened — status: ${session.status}, offer: ₹${session.offered_price}`);

  const notifiedAt: Array<{ name: string; userId: string | null; at: Date | null; outcome: string }> = [];

  // #1 is notified on session open. Wait for the bell, then pass to cascade to #2.
  const c1 = session.candidate_list[0];
  const b1 = ranked.find((c) => c.buyer._id.equals(c1!.buyer_id))!.buyer;
  notifiedAt.push({ name: b1.name, userId: b1.user_id, at: b1.user_id ? await waitForNotification(b1.user_id, runStart) : null, outcome: 'passed' });
  console.log(`[dunk] 🔔 #1 ${b1.name} notified — simulating a pass so the offer cascades…`);
  await recordBuyerResponse(sessionId, c1!.buyer_id.toString(), 'declined');

  // #2 is now the current candidate.
  const s2 = await db.collection<MatchSessionDoc>(MATCH_SESSIONS).findOne({ _id: session._id });
  const c2 = s2!.candidate_list[1];
  const b2 = ranked.find((c) => c.buyer._id.equals(c2!.buyer_id))!.buyer;
  notifiedAt.push({ name: b2.name, userId: b2.user_id, at: b2.user_id ? await waitForNotification(b2.user_id, runStart) : null, outcome: 'passed' });
  console.log(`[dunk] 🔔 #2 ${b2.name} notified — simulating a pass so the offer cascades…`);
  await recordBuyerResponse(sessionId, c2!.buyer_id.toString(), 'declined');

  // #3 is left PENDING — accept this one live on stage.
  const s3 = await db.collection<MatchSessionDoc>(MATCH_SESSIONS).findOne({ _id: session._id });
  const c3 = s3!.candidate_list[2];
  const b3 = ranked.find((c) => c.buyer._id.equals(c3!.buyer_id))!.buyer;
  notifiedAt.push({ name: b3.name, userId: b3.user_id, at: b3.user_id ? await waitForNotification(b3.user_id, runStart) : null, outcome: 'PENDING' });
  console.log(`[dunk] 🔔 #3 ${b3.name} notified — left PENDING (accept live to close the match).`);

  // 6) The cascade also pings the SELLER ("Buyer didn't respond" / "Found new
  //    nearby buyers"). Sweep anything that isn't a buyer offer, so the only
  //    bells lit are the ones we're demoing. Match on title alone: the engine
  //    writes buyer notifications WITHOUT a return_id (matchingEngine.ts:204),
  //    so a `return_id: {$ne: RETURN_ID}` clause would match the absent field
  //    and delete exactly the three docs we want to keep. Safe because step 1
  //    emptied the collection — every surviving offer belongs to this run.
  const sweep = await db
    .collection<NotificationDoc>(NOTIFICATIONS)
    .deleteMany({ title: { $ne: BUYER_NOTIF_TITLE } });
  if (sweep.deletedCount > 0) {
    console.log(`\n[dunk] swept ${sweep.deletedCount} incidental seller notification(s) raised during the cascade.`);
  }

  // Backfill the link the engine omits, so each offer is traceable to this return.
  await db
    .collection<NotificationDoc>(NOTIFICATIONS)
    .updateMany({ title: BUYER_NOTIF_TITLE }, { $set: { return_id: RETURN_ID } });

  const remaining = await db.collection<NotificationDoc>(NOTIFICATIONS).find({}).toArray();
  console.log(`[dunk] notifications now in the database: ${remaining.length}`);
  remaining
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
    .forEach((n, i) => console.log(`   ${i + 1}. ${n.seller_id.padEnd(14)} "${n.title}"  ${fmtTime(n.created_at)}`));

  // 7) Ordered summary + login cheat-sheet.
  console.log('\n──────── notification order (this is the story you tell) ────────');
  notifiedAt.forEach((n, i) => {
    const login = n.userId ? `login: ${n.userId.replace('user_', '')}` : 'synthetic (no login)';
    console.log(`  ${i + 1}. ${n.name.padEnd(16)} notified ${fmtTime(n.at)}  →  ${n.outcome.padEnd(8)} (${login})`);
  });

  console.log('\n──────── show it on the frontend ────────');
  console.log('  Buyer side — log into each account, the nav bell shows the offer:');
  PLAN.filter((p) => p.userId).forEach((p, i) => {
    console.log(`    #${i + 1}  ${p.handle} / ${p.password}`);
  });
  console.log('  Seller side — the ranked candidate list + map for this return:');
  console.log(`    GET  /api/matching/status/${RETURN_ID}`);
  console.log(`  Close it live (as #3, ${b3.name}):`);
  console.log(`    POST /api/matching/respond/${sessionId}   { "buyerId": "${c3!.buyer_id.toString()}", "response": "accepted" }`);
  console.log('    (accepting also pings seller "urbanthread": "Matched with a local buyer!")\n');

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[dunk] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
