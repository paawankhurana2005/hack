// Demo accounts — the people in the ReLoop story. Sellers (the stores users buy
// from) and shoppers (who return / resell / buy second-life). No real auth; you
// "log in" by typing a handle on the login screen. Persisted to localStorage.

export type AccountKind = 'user' | 'seller';

export interface Account {
  id: string;
  kind: AccountKind;
  name: string;
  handle: string; // what you type to log in
  city?: string;
  initials: string;
  glyph: string;
  blurb: string;
}

export const ACCOUNTS: Account[] = [
  // --- Shoppers ------------------------------------------------------------
  {
    id: 'user_aarav',
    kind: 'user',
    name: 'Aarav Shah',
    handle: 'aarav',
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
    initials: 'UT',
    glyph: '▦',
    blurb: 'Fashion & footwear brand. High-volume returns and resale from the pro dashboard.',
  },
  {
    id: 'seller_techbazaar',
    kind: 'seller',
    name: 'TechBazaar',
    handle: 'techbazaar',
    initials: 'TB',
    glyph: '▦',
    blurb: 'Electronics seller. Grade returns at the doorstep and route them intelligently.',
  },
];

export const DEFAULT_ACCOUNT_ID = 'user_aarav';

export function getAccount(id: string | null | undefined): Account | undefined {
  return ACCOUNTS.find((a) => a.id === id);
}

export const USERS = ACCOUNTS.filter((a) => a.kind === 'user');
export const SELLERS = ACCOUNTS.filter((a) => a.kind === 'seller');

/** Resolve a typed handle (case-insensitive) to an account — by handle, id, full
 *  name, or first name. */
export function findAccountByHandle(input: string): Account | undefined {
  const q = input.trim().toLowerCase();
  if (!q) return undefined;
  return ACCOUNTS.find(
    (a) =>
      a.handle === q ||
      a.id === q ||
      a.name.toLowerCase() === q ||
      a.name.split(' ')[0]!.toLowerCase() === q,
  );
}
