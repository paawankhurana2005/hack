// Demo marketplace state (localStorage, no backend): which items are sold, the
// buyer's purchases, and the buyer's running EcoCredits. A purchase is a pure,
// controllable state change — the foundation of the simulated buy flow.

import type { Money, ShopItem } from '@reloop/shared';
import { estimateBuyerImpact, estimateImpact } from '@reloop/shared';

const inr = (cents: number): Money => ({ amountCents: cents, currency: 'INR' });

const SOLD_KEY = 'reloop.sold';
const PURCHASES_KEY = 'reloop.purchases';

export interface Purchase {
  id: string;
  title: string;
  price: Money;
  buyerCredits: number;
  at: string; // ISO
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — flow still completes in-memory for the session */
  }
}

export function getSoldIds(): string[] {
  return read<string[]>(SOLD_KEY, []);
}

export function isSold(id: string): boolean {
  return getSoldIds().includes(id);
}

export function getPurchases(): Purchase[] {
  return read<Purchase[]>(PURCHASES_KEY, []);
}

export interface PurchaseResult {
  buyerCredits: number;
  sellerCredits: number;
  co2SavedKg: number;
}

/**
 * Simulated transaction: mark sold, record the purchase, award buyer EcoCredits.
 * `salePriceCents` lets the caller sell at the agent's current (repriced) price so
 * the sale stays consistent with the agent's own history.
 */
export function buyItem(item: ShopItem, salePriceCents?: number): PurchaseResult {
  const salePrice = inr(salePriceCents ?? item.listingPrice.amountCents);
  const buyer = estimateBuyerImpact(item.category, item.originalPrice, salePrice);
  const seller = estimateImpact(item.category, salePrice);

  write(SOLD_KEY, Array.from(new Set([...getSoldIds(), item.id])));
  const purchase: Purchase = {
    id: item.id,
    title: item.card.title,
    price: salePrice,
    buyerCredits: buyer.ecoCredits,
    at: new Date().toISOString(),
  };
  write(PURCHASES_KEY, [purchase, ...getPurchases()]);

  return {
    buyerCredits: buyer.ecoCredits,
    sellerCredits: seller.ecoCredits,
    co2SavedKg: buyer.co2SavedKg,
  };
}
