// Demo accounts — the people in the ReLoop story. One seller (the store the users
// bought from) and two users (so we can demonstrate resale between them). No real
// auth; identity is a pick on the login screen, persisted to localStorage.

export type AccountKind = 'user' | 'seller';

export interface Account {
  id: string;
  kind: AccountKind;
  name: string;
  handle: string;
  city?: string;
  initials: string;
  glyph: string;
  blurb: string;
}

export const ACCOUNTS: Account[] = [
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
    id: 'seller_urban',
    kind: 'seller',
    name: 'UrbanThread Store',
    handle: 'urbanthread',
    initials: 'UT',
    glyph: '▦',
    blurb: 'High-volume returns and resale, managed from the pro dashboard — grading, routing, insights.',
  },
];

export const DEFAULT_ACCOUNT_ID = 'user_aarav';

export function getAccount(id: string | null | undefined): Account | undefined {
  return ACCOUNTS.find((a) => a.id === id);
}

export const USERS = ACCOUNTS.filter((a) => a.kind === 'user');
