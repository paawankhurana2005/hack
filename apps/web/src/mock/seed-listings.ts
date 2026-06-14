// Demo seed listings for My Listings — each carries baked agent metadata
// (floor, retail, grade, market context) so the Listing Agent produces an
// identical, scripted arc every run. Two stories:
//   1. Pegasus  — healthy: reprice → widen → improve → holds, then sells in Shop.
//   2. Worn runners — unsellable: reprice to floor → widen → recommends RECYCLE.

import type { ConditionGrade, MarketContext, Money } from '@reloop/shared';
import type { CasualListing } from './casual-listings';
import { findShopItem, heroShopItem } from './shop-items';

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

// Build a seller's My-Listings entry from a Shop catalog item, so the same item
// is buyable by others (via the catalog) AND shows in the owner's My Listings
// with the Listing Agent watching it.
function listingFromShop(
  shopId: string,
  sellerId: string,
  sellerName: string,
  agent: { floorCents: number; market: MarketContext },
): CasualListing {
  const it = findShopItem(shopId)!;
  return {
    id: it.id,
    itemId: it.card.itemId,
    title: it.card.title,
    imageUrl: it.imageUrl,
    listedPrice: it.listingPrice,
    status: 'listed',
    views: 9,
    listedAt: it.card.issuedAt,
    sellerId,
    sellerName,
    category: it.category,
    grade: it.card.grade as ConditionGrade,
    floorCents: agent.floorCents,
    retailCents: it.originalPrice.amountCents,
    market: agent.market,
  };
}

// The user's hero — also lives in the Shop (they're the seller). Buying it there
// flips it to Sold here. The agent walks its price down toward the comparable.
const PEGASUS_MARKET: MarketContext = {
  comparableCents: 350000, // ₹3,500 nearby comparable
  localDemand: 'medium',
  holdingCostPerDayCents: 4000, // ₹40/day
  baseViewsPerDay: 7,
};

export const pegasusListing: CasualListing = {
  id: heroShopItem.id,
  itemId: heroShopItem.card.itemId,
  title: heroShopItem.card.title,
  imageUrl: heroShopItem.imageUrl,
  listedPrice: heroShopItem.listingPrice, // ₹3,999
  status: 'listed',
  views: 12,
  listedAt: heroShopItem.card.issuedAt,
  sellerId: 'user_aarav',
  sellerName: 'Aarav Shah',
  category: 'sports',
  grade: 'like-new',
  floorCents: 300000, // ₹3,000 — the rail
  retailCents: 999900, // ₹9,999
  market: PEGASUS_MARKET,
};

// The unsellable case: a cheap, well-worn pair of wired earphones. The market
// wants ₹220 but our floor is ₹300 — the agent can't profitably reach the market
// and, with low demand even city-wide, recommends recycling (e-waste) instead of
// holding it forever.
const WORN_EARPHONES_MARKET: MarketContext = {
  comparableCents: 22000, // ₹220 — BELOW our floor
  localDemand: 'low',
  holdingCostPerDayCents: 2500, // ₹25/day
  baseViewsPerDay: 5,
};

export const wornEarphonesListing: CasualListing = {
  id: 'lst_worn_runners',
  itemId: 'itm_worn_earphones',
  title: 'Wired Earphones · 4 yrs',
  imageUrl: '/catalog/earphones.jpg',
  listedPrice: inr(45000), // ₹450
  status: 'listed',
  views: 4,
  listedAt: '2025-06-09T09:00:00.000Z',
  sellerId: 'user_aarav',
  sellerName: 'Aarav Shah',
  category: 'electronics',
  grade: 'poor',
  floorCents: 30000, // ₹300 — lowest sustainable resale
  retailCents: 99900, // ₹999
  market: WORN_EARPHONES_MARKET,
};

// Other users' listings — each is a Shop catalog item assigned to a real user, so
// the marketplace has cross-user inventory and every user has a My Listings entry.
export const sonyListing = listingFromShop('shop_sony', 'user_meera', 'Meera Iyer', {
  floorCents: 1100000, // ₹11,000
  market: { comparableCents: 1500000, localDemand: 'high', holdingCostPerDayCents: 9000, baseViewsPerDay: 9 },
});

export const coachListing = listingFromShop('shop_coach', 'user_ananya', 'Ananya Rao', {
  floorCents: 800000, // ₹8,000
  market: { comparableCents: 1100000, localDemand: 'medium', holdingCostPerDayCents: 8000, baseViewsPerDay: 6 },
});

export const watchListing = listingFromShop('shop_watch', 'user_rohan', 'Rohan Verma', {
  floorCents: 1800000, // ₹18,000
  market: { comparableCents: 2000000, localDemand: 'low', holdingCostPerDayCents: 12000, baseViewsPerDay: 4 },
});

/** Seed listings shown for the demo (newest-feeling first). */
export const seedListings: CasualListing[] = [
  wornEarphonesListing,
  pegasusListing,
  sonyListing,
  coachListing,
  watchListing,
];

export function findSeedListing(id: string): CasualListing | undefined {
  return seedListings.find((l) => l.id === id);
}
