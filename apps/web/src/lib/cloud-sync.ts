// Generic localStorage <-> cloud mirror. Keeps localStorage as the fast, local
// source of truth (so every existing store keeps working synchronously) while
// durably mirroring it to MongoDB via the API. On login we hydrate localStorage
// from the cloud; on every change we push a debounced snapshot back.
//
// Scoping: keys namespaced to the signed-in account (`reloop.<accountId>.*`) sync
// to that account's scope; all other shared keys (the marketplace, returns queue,
// etc.) sync to a single "__shared__" scope so the shared demo data persists too.
// Another account's namespaced keys are never synced into the shared scope.
//
// Best-effort throughout: if the API/DB is unreachable, every call no-ops and the
// app simply runs on localStorage alone.

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const SHARED = '__shared__';
const DEBOUNCE_MS = 800;

let currentAccountId: string | null = null;
let installed = false;
let suppress = false; // true while applying cloud data, so we don't echo it back
let timer: ReturnType<typeof setTimeout> | null = null;

/** Which cloud scope a localStorage key belongs to (or null = don't sync). */
function classify(key: string, accountId: string): 'account' | 'shared' | null {
  if (!key.startsWith('reloop')) return null;
  if (key === 'reloop.account') return null; // device-local login pointer
  if (key.startsWith(`reloop.${accountId}.`)) return 'account';
  // A different account's namespaced data — never fold into the shared scope.
  if (/^reloop\.(user_[^.]+|seller_[^.]+)\./.test(key)) return null;
  return 'shared';
}

function snapshot(accountId: string): {
  account: Record<string, string>;
  shared: Record<string, string>;
} {
  const account: Record<string, string> = {};
  const shared: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    const c = classify(k, accountId);
    if (!c) continue;
    const v = window.localStorage.getItem(k);
    if (v == null) continue;
    if (c === 'account') account[k] = v;
    else shared[k] = v;
  }
  return { account, shared };
}

async function getScope(scope: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/state/${scope}`);
    if (!res.ok) return null;
    const doc = (await res.json()) as { data?: Record<string, string> };
    return doc.data ?? {};
  } catch {
    return null;
  }
}

async function putScope(scope: string, data: Record<string, string>): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/state/${scope}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  } catch {
    /* best effort */
  }
}

function applyData(data: Record<string, string> | null): void {
  if (!data) return;
  suppress = true;
  try {
    for (const [k, v] of Object.entries(data)) {
      window.localStorage.setItem(k, v);
    }
  } finally {
    suppress = false;
  }
}

function pushSoon(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void pushNow();
  }, DEBOUNCE_MS);
}

/** Snapshot and push the signed-in account's data + shared data to the cloud. */
export async function pushNow(): Promise<void> {
  if (typeof window === 'undefined' || !currentAccountId) return;
  const { account, shared } = snapshot(currentAccountId);
  await Promise.all([putScope(currentAccountId, account), putScope(SHARED, shared)]);
}

function installHook(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const ls = window.localStorage;
  const origSet = ls.setItem.bind(ls);
  const origRemove = ls.removeItem.bind(ls);
  ls.setItem = (key: string, value: string): void => {
    origSet(key, value);
    if (!suppress && currentAccountId && classify(key, currentAccountId)) pushSoon();
  };
  ls.removeItem = (key: string): void => {
    origRemove(key);
    if (!suppress && currentAccountId && classify(key, currentAccountId)) pushSoon();
  };
}

/** Pull this account's cloud data (+ shared data) into localStorage. */
export async function hydrateFromCloud(accountId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  installHook();
  currentAccountId = accountId;
  const [shared, account] = await Promise.all([getScope(SHARED), getScope(accountId)]);
  applyData(shared);
  applyData(account);
  // First time this account exists in the cloud? Seed it from local data.
  if (account && Object.keys(account).length === 0) {
    void pushNow();
  }
}

/** Hydrate, but never block the UI for more than `ms` (cold API/cluster). The
 *  fetch keeps running in the background and lands when it returns. */
export function hydrateBounded(accountId: string, ms = 5000): Promise<void> {
  return Promise.race([
    hydrateFromCloud(accountId),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
}

/** Stop syncing (on logout). */
export function stopCloudSync(): void {
  currentAccountId = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
