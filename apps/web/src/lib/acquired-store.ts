// Buyer-acquired items — the buy → own bridge. When a user buys a second-life
// item, it becomes something THEY own and can re-list, carrying the SAME itemId so
// re-listing appends to the existing provenance chain. Stored per-user (namespaced)
// so each account only sees what it bought.

import type { UserOwnedItem } from '@/mock/owned-items';
import { nsKey, readJson, writeJson } from './storage';

const BASE = 'acquired';

/** Items the signed-in user bought and now owns (newest first). */
export function getAcquiredItems(accountId?: string): UserOwnedItem[] {
  return readJson<UserOwnedItem[]>(nsKey(BASE, accountId), []);
}

export function findAcquiredItem(id: string, accountId?: string): UserOwnedItem | undefined {
  return getAcquiredItems(accountId).find((i) => i.id === id);
}

/** Record a freshly bought item as owned by the buyer. De-dupes on item id. */
export function addAcquiredItem(item: UserOwnedItem, accountId?: string): void {
  const key = nsKey(BASE, accountId);
  const existing = getAcquiredItems(accountId);
  if (existing.some((i) => i.id === item.id)) return;
  writeJson(key, [item, ...existing]);
}
