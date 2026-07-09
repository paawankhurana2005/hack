// Read-only snapshot of the demo-relevant collections. No writes.
//   pnpm --filter @reloop/api inspect:demo

import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { BUYERS, RETURNS, MATCH_SESSIONS, NOTIFICATIONS } from '../lib/collections.js';

async function main(): Promise<void> {
  if (!isMongoConfigured()) {
    console.error('MONGODB_URI not set.');
    process.exit(1);
  }
  const db = await getDb();

  for (const c of [BUYERS, RETURNS, MATCH_SESSIONS, NOTIFICATIONS]) {
    console.log(`${c.padEnd(16)} ${await db.collection(c).countDocuments()} docs`);
  }

  console.log('\n-- returns --');
  for (const r of await db.collection(RETURNS).find({}).toArray()) {
    console.log(`  ${String(r.returnId).padEnd(20)} ${String(r.productName ?? '-').padEnd(42)} grade=${r.grade ?? '-'} seller=${r.seller_id ?? '-'}`);
  }

  console.log('\n-- match_sessions --');
  for (const s of await db.collection(MATCH_SESSIONS).find({}).toArray()) {
    console.log(`  return=${s.return_id} status=${s.status} candidates=${(s.candidate_list ?? []).length} idx=${s.current_candidate_index}`);
  }

  console.log('\n-- notifications grouped (seller_id | kind | title) --');
  const grouped = await db
    .collection(NOTIFICATIONS)
    .aggregate([{ $group: { _id: { s: '$seller_id', k: '$kind', t: '$title' }, n: { $sum: 1 } } }, { $sort: { n: -1 } }])
    .toArray();
  for (const g of grouped) {
    console.log(`  ${String(g._id.s).padEnd(16)} ${String(g._id.k).padEnd(16)} ${String(g._id.t).padEnd(38)} x${g.n}`);
  }

  process.exit(0);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
