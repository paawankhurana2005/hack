// Demo seed listings for My Listings — each carries baked agent metadata
// (floor, retail, grade, market context) so the Listing Agent produces an
// identical, scripted arc every run. Two stories:
//   1. Pegasus  — healthy: reprice → widen → improve → holds, then sells in Shop.
//   2. Worn runners — unsellable: reprice to floor → widen → recommends RECYCLE.

import type { MarketContext, Money } from '@reloop/shared';
import type { CasualListing } from './casual-listings';
import { heroShopItem } from './shop-items';

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

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
  title: heroShopItem.card.title,
  imageUrl: heroShopItem.imageUrl,
  listedPrice: heroShopItem.listingPrice, // ₹3,999
  status: 'listed',
  views: 12,
  listedAt: heroShopItem.card.issuedAt,
  category: 'sports',
  grade: 'like-new',
  floorCents: 300000, // ₹3,000 — the rail
  retailCents: 999900, // ₹9,999
  market: PEGASUS_MARKET,
};

// The unsellable case: a well-worn pair. The market wants ₹1,000 but our floor is
// ₹1,100 — the agent can't profitably reach the market and, with low demand even
// city-wide, recommends recycling instead of holding it forever.
const WORN_RUNNERS_MARKET: MarketContext = {
  comparableCents: 100000, // ₹1,000 — BELOW our floor
  localDemand: 'low',
  holdingCostPerDayCents: 7000, // ₹70/day
  baseViewsPerDay: 5,
};

export const wornRunnersListing: CasualListing = {
  id: 'lst_worn_runners',
  title: 'Worn Running Shoes · 3 yrs',
  imageUrl: '/demo/ua-charged/side.jpg',
  listedPrice: inr(180000), // ₹1,800
  status: 'listed',
  views: 4,
  listedAt: '2025-06-09T09:00:00.000Z',
  category: 'sports',
  grade: 'poor',
  floorCents: 110000, // ₹1,100 — lowest sustainable resale
  retailCents: 450000, // ₹4,500
  market: WORN_RUNNERS_MARKET,
};

/** Seed listings shown for the demo (newest-feeling first). */
export const seedListings: CasualListing[] = [wornRunnersListing, pegasusListing];

export function findSeedListing(id: string): CasualListing | undefined {
  return seedListings.find((l) => l.id === id);
}
