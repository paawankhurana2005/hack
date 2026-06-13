// Small localStorage helpers shared by the demo stores. The "current account" is
// the identity picked at login; per-user data is namespaced by it so each user
// has their own credits, purchases, and rewards while the marketplace stays shared.

import { DEFAULT_ACCOUNT_ID } from './accounts';

export const ACCOUNT_KEY = 'reloop.account';

/** The signed-in account id (falls back to the default for SSR / first load). */
export function currentAccountId(): string {
  if (typeof window === 'undefined') return DEFAULT_ACCOUNT_ID;
  try {
    return window.localStorage.getItem(ACCOUNT_KEY) ?? DEFAULT_ACCOUNT_ID;
  } catch {
    return DEFAULT_ACCOUNT_ID;
  }
}

/** Namespace a storage key to an account: `reloop.<account>.<base>`. */
export function nsKey(base: string, accountId?: string): string {
  return `reloop.${accountId ?? currentAccountId()}.${base}`;
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — session only */
  }
}
