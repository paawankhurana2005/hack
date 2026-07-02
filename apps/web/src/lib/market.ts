// The shared marketplace view. Unifies the static "other sellers" catalog with
// user-created resale listings into one buyable feed, each tagged with the seller
// account. A viewer never sees their own listings (you can't buy your own item).

import type { ShopItem } from '@reloop/shared';
import { shopItems as staticShopItems, HERO_ID } from '@/mock/shop-items';
import { getListings } from '@/lib/listings-store';
import { getAccount } from '@/lib/accounts';
import type { CasualListing } from '@/mock/casual-listings';

export interface ShopEntry extends ShopItem {
  sellerId: string;
  /** Spec 016: a hub-dispatched RETURN — open-box, doorstep-graded, hub-verified. */
  openBox?: boolean;
}

// Most catalog items belong to "external" sellers, but a few are owned by our
// real users so they appear in OTHER users' shops and in the owner's My Listings.
const STATIC_SELLER: Record<string, string> = {
  [HERO_ID]: 'user_aarav', // Adidas Samba
  shop_sony: 'user_meera', // Sony headphones
  shop_coach: 'user_ananya', // Prada handbag
  shop_watch: 'user_rohan', // Apple Watch
};

function fromStatic(item: ShopItem): ShopEntry {
  const sellerId = STATIC_SELLER[item.id] ?? `ext_${item.id}`;
  const account = getAccount(sellerId);
  return { ...item, sellerId, sellerName: account ? account.name : item.sellerName };
}

/** A user listing is buyable only once it carries full Shop-rendering data. */
function fromListing(l: CasualListing): ShopEntry | null {
  if (!l.card || !l.impact || !l.originalPrice || !l.category || !l.sellerId) return null;
  return {
    id: l.id,
    category: l.category,
    imageUrl: l.imageUrl,
    sellerId: l.sellerId,
    sellerName: l.sellerName ?? getAccount(l.sellerId)?.name ?? 'A seller',
    originalPrice: l.originalPrice,
    listingPrice: l.listedPrice,
    card: l.card,
    impact: l.impact,
    openBox: l.returnId !== undefined,
  };
}

function allEntries(): ShopEntry[] {
  const listingEntries = getListings()
    .map(fromListing)
    .filter((e): e is ShopEntry => e !== null);
  const seen = new Set(listingEntries.map((e) => e.id));
  const statics = staticShopItems.map(fromStatic).filter((e) => !seen.has(e.id));
  return [...listingEntries, ...statics];
}

/** Everything the viewer can buy (their own listings excluded). */
export function getShopEntries(viewerId: string | null): ShopEntry[] {
  return allEntries().filter((e) => e.sellerId !== viewerId);
}

/** Resolve a single entry by id (no viewer filter — used by the detail page). */
export function findShopEntry(id: string): ShopEntry | undefined {
  return allEntries().find((e) => e.id === id);
}
