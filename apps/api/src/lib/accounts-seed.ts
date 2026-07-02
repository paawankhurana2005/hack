// Demo accounts seeded into MongoDB. Mirrors apps/web/src/lib/accounts.ts (same
// ids/handles) and adds a DUMMY password per account. These are demo credentials,
// shown on the login screen on purpose — not real secrets, stored in plaintext.

import type { Db } from 'mongodb';
import bcrypt from 'bcryptjs';

export type AccountKind = 'user' | 'seller';

export interface SeedAccount {
  id: string;
  kind: AccountKind;
  name: string;
  handle: string;
  password: string;
  city?: string;
  initials: string;
  glyph: string;
  blurb: string;
}

/** The account fields safe to return to the client (everything except password). */
export type PublicAccount = Omit<SeedAccount, 'password'>;

export const COLLECTION = 'users';

export const DEMO_ACCOUNTS: SeedAccount[] = [
  // --- Shoppers ------------------------------------------------------------
  {
    id: 'user_aarav',
    kind: 'user',
    name: 'Aarav Shah',
    handle: 'aarav',
    password: 'aarav123',
    city: 'Bengaluru',
    initials: 'AS',
    glyph: '$',
    blurb: 'Return items still in their window, or give the ones you’re done with a second life.',
  },
  {
    id: 'user_meera',
    kind: 'user',
    name: 'Meera Iyer',
    handle: 'meera',
    password: 'meera123',
    city: 'Pune',
    initials: 'MI',
    glyph: '$',
    blurb: 'Shop verified second-life items nearby and return what didn’t work out.',
  },
  {
    id: 'user_rohan',
    kind: 'user',
    name: 'Rohan Verma',
    handle: 'rohan',
    password: 'rohan123',
    city: 'Mumbai',
    initials: 'RV',
    glyph: '$',
    blurb: 'Resell what you’ve outgrown and buy second-life gear at a fraction of new.',
  },
  {
    id: 'user_ananya',
    kind: 'user',
    name: 'Ananya Rao',
    handle: 'ananya',
    password: 'ananya123',
    city: 'Delhi',
    initials: 'AR',
    glyph: '$',
    blurb: 'Keep good things in the loop — return, resell, and shop circular.',
  },
  // --- Sellers -------------------------------------------------------------
  {
    id: 'seller_urban',
    kind: 'seller',
    name: 'UrbanThread Store',
    handle: 'urbanthread',
    password: 'urbanthread123',
    initials: 'UT',
    glyph: '▦',
    blurb: 'Fashion & footwear brand. High-volume returns and resale from the pro dashboard.',
  },
  {
    id: 'seller_techbazaar',
    kind: 'seller',
    name: 'TechBazaar',
    handle: 'techbazaar',
    password: 'techbazaar123',
    initials: 'TB',
    glyph: '▦',
    blurb: 'Electronics seller. Grade returns at the doorstep and route them intelligently.',
  },
];

function toPublic(account: SeedAccount): PublicAccount {
  const { password: _password, ...rest } = account;
  return rest;
}

/**
 * Idempotently upsert the demo accounts into the `users` collection. Runs once
 * per process (the promise is cached) so concurrent requests don't re-seed.
 */
let seedPromise: Promise<void> | null = null;

export function ensureSeeded(db: Db): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const col = db.collection<SeedAccount>(COLLECTION);
      await col.createIndex({ handle: 1 }, { unique: true });
      for (const acc of DEMO_ACCOUNTS) {
        const existing = await col.findOne({ id: acc.id });
        // Store a bcrypt hash, never plaintext. Existing already-hashed docs are
        // left as-is (idempotent); legacy plaintext docs are migrated to a hash.
        const alreadyHashed = existing?.password?.startsWith('$2') ?? false;
        const password = alreadyHashed
          ? (existing as SeedAccount).password
          : await bcrypt.hash(acc.password, 10);
        await col.updateOne({ id: acc.id }, { $set: { ...acc, password } }, { upsert: true });
      }
    })().catch((err) => {
      // Reset so a transient failure can be retried on the next request.
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

export { toPublic };
