// Seed the staged Adidas Ultraboost chain (Amazon → Aarav → Meera, 2 lives) into
// DynamoDB via the Lambda Function URL. Mirrors apps/web/src/mock/provenance-seed.ts
// so the live Health Card History reads its flagship 2-life chain from DynamoDB.
//
//   node infra/seed.mjs <FUNCTION_URL>

const FURL = (process.argv[2] || '').replace(/\/+$/, '');
if (!FURL) {
  console.error('usage: node seed.mjs <FUNCTION_URL>');
  process.exit(1);
}

const ITEM_ID = 'itm_ultraboost';
const CATEGORY = 'sports';
const TITLE = 'Adidas Ultraboost Light';
const inr = (amountCents) => ({ amountCents, currency: 'INR' });
const ACQUIRED = '2026-04-22T11:20:00.000Z';

const events = [
  { type: 'origin', at: '2023-08-15T08:00:00.000Z', verified: true, seller: 'Amazon' },
  { type: 'owned', at: '2023-08-17T18:30:00.000Z', verified: true, ownerName: 'Aarav Shah' },
  {
    type: 'graded',
    at: '2026-04-10T09:00:00.000Z',
    verified: true,
    grade: 'like-new',
    confidence: 0.94,
    issues: ['Faint outsole wear'],
    referenceMatch: true,
  },
  { type: 'listed', at: '2026-04-10T09:02:00.000Z', verified: true, price: inr(320000) },
  {
    type: 'sold',
    at: ACQUIRED,
    verified: true,
    buyerName: 'Meera Iyer',
    price: inr(320000),
    co2SavedKg: 6,
    ecoCredits: 28,
  },
  { type: 'owned', at: ACQUIRED, verified: true, ownerName: 'Meera Iyer' },
];

const run = async () => {
  for (const ev of events) {
    const res = await fetch(`${FURL}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: ITEM_ID, event: ev, category: CATEGORY, title: TITLE }),
    });
    if (!res.ok) throw new Error(`seed failed (${res.status}) on ${ev.type}`);
  }
  console.log(`  seeded ${events.length} events for ${ITEM_ID}`);
};

run().catch((e) => {
  console.error('  seed error:', e.message);
  process.exit(1);
});
