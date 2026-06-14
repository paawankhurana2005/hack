// Marketplace state (demo, localStorage). The SOLD set is GLOBAL — the
// marketplace is shared, so one user's listing can be bought by another. The
// buyer's PURCHASES are per-user (namespaced) so each account has its own history
// and EcoCredits.

import type { Money, ShopItem } from '@reloop/shared';
import { estimateBuyerImpact, estimateImpact } from '@reloop/shared';
import { currentAccountId, nsKey, readJson, writeJson } from './storage';
import { getAccount } from './accounts';
import { appendEvent, deriveChainFromCard } from './provenance-store';
import { addAcquiredItem } from './acquired-store';

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
  const at = new Date().toISOString();
  const purchase: Purchase = {
    id: item.id,
    title: item.card.title,
    price: salePrice,
    buyerCredits: buyer.ecoCredits,
    at,
  };
  writeJson(nsKey(PURCHASES_BASE), [purchase, ...getPurchases()]);

  // Provenance: the item changes hands. Append the sale + the new ownership to its
  // chain (append-only — the seller's whole prior life is preserved), then make it
  // something the BUYER owns and can re-list, carrying the SAME itemId.
  const buyerId = currentAccountId();
  const buyerName = getAccount(buyerId)?.name ?? 'A buyer';
  const fallback = deriveChainFromCard(item.card, {
    category: item.category,
    sellerName: item.sellerName,
  });
  appendEvent(
    item.card.itemId,
    {
      type: 'sold',
      at,
      verified: true,
      buyerName,
      price: salePrice,
      co2SavedKg: buyer.co2SavedKg,
      ecoCredits: buyer.ecoCredits,
    },
    fallback,
  );
  appendEvent(
    item.card.itemId,
    { type: 'owned', at, verified: true, ownerName: buyerName },
    fallback,
  );
  addAcquiredItem(
    {
      id: `acq_${item.id}`,
      itemId: item.card.itemId,
      ownerId: buyerId,
      title: item.card.title,
      category: item.category,
      imageUrl: item.imageUrl,
      purchaseDate: at,
      originalPrice: item.originalPrice,
      description: 'Bought through ReLoop — ready to give it another life.',
      returnEligible: false,
      originalListingImages: [item.imageUrl],
      originalSpecs: {},
    },
    buyerId,
  );

  return {
    buyerCredits: buyer.ecoCredits,
    sellerCredits: seller.ecoCredits,
    co2SavedKg: buyer.co2SavedKg,
  };
}
