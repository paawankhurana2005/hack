// Clears every user-submitted return so all owned items become return-eligible
// again. Use this to reset a demo box between runs.
//
// Run:  pnpm --filter @reloop/api reset:returns
//
// Why the cloud state and not just the browser: the web app mirrors
// localStorage into MongoDB (`state` collection, see routes/state.ts). On login,
// hydrateFromCloud() writes the cloud copy BACK into localStorage — so clearing
// the browser alone is undone on the next page load. We therefore overwrite the
// stored value with an empty array rather than deleting the key: applyData()
// only ever calls setItem, so an absent key would leave the stale browser copy
// untouched (and it would then be re-pushed to the cloud).
//
// Seeded seller-dashboard returns (SEEDED_RETURNS in the web app) are code
// constants on ORD-55xx and gate no owned item, so they come back on their own.
// Any localStorage override of them is dropped here, reverting them to pristine.

import { getDb, isMongoConfigured } from '../lib/mongo.js';

const COLLECTION = 'state';
const RETURNS_KEY = 'reloop_returns_v1';

interface StateDoc {
  scope: string;
  data: Record<string, string>;
  updatedAt: string;
}

interface ReturnSummary {
  returnId?: string;
  orderId?: string;
  status?: string;
  productName?: string;
}

function summarize(raw: string): ReturnSummary[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReturnSummary[]) : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  if (!isMongoConfigured()) {
    console.error('MONGODB_URI is not set — nothing to reset.');
    process.exit(1);
  }

  const db = await getDb();
  const states = db.collection<StateDoc>(COLLECTION);
  const scopes = await states.find({}, { projection: { _id: 0 } }).toArray();

  let clearedScopes = 0;
  let clearedReturns = 0;

  for (const doc of scopes) {
    const raw = doc.data?.[RETURNS_KEY];
    if (raw === undefined) continue;

    const existing = summarize(raw);
    if (existing.length > 0) {
      console.log(`\nscope "${doc.scope}" — clearing ${existing.length} return(s):`);
      for (const r of existing) {
        console.log(`  ${r.returnId ?? '?'}  order=${r.orderId ?? '?'}  status=${r.status ?? '?'}  ${r.productName ?? ''}`);
      }
    }

    await states.updateOne(
      { scope: doc.scope },
      { $set: { [`data.${RETURNS_KEY}`]: '[]', updatedAt: new Date().toISOString() } },
    );
    clearedScopes += 1;
    clearedReturns += existing.length;
  }

  if (clearedScopes === 0) {
    console.log('No stored returns found — every owned item is already return-eligible.');
  } else {
    console.log(
      `\nCleared ${clearedReturns} return(s) across ${clearedScopes} scope(s). ` +
        'Reload the web app (logged in) to pull the empty set into localStorage.',
    );
  }

  process.exit(0);
}

void main().catch((err: unknown) => {
  console.error('reset:returns failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
