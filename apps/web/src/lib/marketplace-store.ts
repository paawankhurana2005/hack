// Marketplace state (demo, localStorage). The SOLD set is GLOBAL — the
// marketplace is shared, so one user's listing can be bought by another. The
// buyer's PURCHASES are per-user (namespaced) so each account has its own history
// and EcoCredits.

import type { Money, ShopItem } from '@reloop/shared';
import { estimateBuyerImpact, estimateImpact } from '@reloop/shared';
import { nsKey, readJson, writeJson } from './storage';

const SOLD_KEY = 'reloop.market.sold'; // global
const PURCHASES_BASE = 'purchases'; // per-user

const inr = (cents: number): Money => ({ amountCents: cents, currency: 'INR' });

export interface Purchase {
  id: string;
  title: string;
  price: Money;
  buyerCredits: number;
  at: string; // ISO
}

export function getSoldIds(): string[] {
  return readJson<string[]>(SOLD_KEY, []);
}

export function isSold(id: string): boolean {
  return getSoldIds().includes(id);
}

/** Purchases by the signed-in user. */
export function getPurchases(): Purchase[] {
  return readJson<Purchase[]>(nsKey(PURCHASES_BASE), []);
}

export interface PurchaseResult {
  buyerCredits: number;
  sellerCredits: number;
  co2SavedKg: number;
}

/**
 * Simulated transaction: mark sold (global), record the purchase for the signed-in
 * buyer, award buyer EcoCredits. `salePriceCents` lets the caller sell at the
 * agent's current (repriced) price so the sale stays consistent with its history.
 * The SELLER's credit is awarded by the caller (it lands in the seller's ledger).
 */
export function buyItem(item: ShopItem, salePriceCents?: number): PurchaseResult {
  const salePrice = inr(salePriceCents ?? item.listingPrice.amountCents);
  const buyer = estimateBuyerImpact(item.category, item.originalPrice, salePrice);
  const seller = estimateImpact(item.category, salePrice);

  writeJson(SOLD_KEY, Array.from(new Set([...getSoldIds(), item.id])));
  const purchase: Purchase = {
    id: item.id,
    title: item.card.title,
    price: salePrice,
    buyerCredits: buyer.ecoCredits,
    at: new Date().toISOString(),
  };
  writeJson(nsKey(PURCHASES_BASE), [purchase, ...getPurchases()]);

  return {
    buyerCredits: buyer.ecoCredits,
    sellerCredits: seller.ecoCredits,
    co2SavedKg: buyer.co2SavedKg,
  };
}
