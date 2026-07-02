// Spec 016 — where a return-originated listing meets the marketplace.
// (a) findOpenBoxOffer: surfaces a live, hub-dispatched return as an "Open-box
//     near you" option on the exact buy-new product page (the demand graph's
//     recommendation layer speaking to the buyer).
// (b) completeReturnSale: a real cross-account purchase closes the return's
//     lifecycle — listed_local → sold → delivered_to_buyer — and retires the agent.

import { getListings } from '@/lib/listings-store';
import { getAgentState, markAgentSold } from '@/lib/agent-store';
import { isSold } from '@/lib/marketplace-store';
import { completeDeal, getReturnById, recordTransition } from '@/lib/mocks/return-store';
import type { CasualListing } from '@/mock/casual-listings';

export interface OpenBoxOffer {
  listing: CasualListing;
  /** The agent's live (possibly repriced) price — not the stale listed price. */
  priceCents: number;
  /** Distance from the local hub holding the unit (demo constant). */
  distanceKm: number;
}

const HUB_DISTANCE_KM = 4;

/** Live return-originated listings, newest first. */
export function getReturnListings(): CasualListing[] {
  return getListings().filter((l) => l.returnId !== undefined);
}

/** A live open-box unit of this exact buy-new product, if the hub dispatched one. */
export function findOpenBoxOffer(storeProductId: string): OpenBoxOffer | null {
  const listing = getReturnListings().find(
    (l) => l.storeProductId === storeProductId && !isSold(l.id),
  );
  if (!listing) return null;
  const agent = getAgentState(listing.id);
  if (agent && (agent.status === 'recycled' || agent.status === 'donated')) return null;
  return {
    listing,
    priceCents: agent?.priceCents ?? listing.listedPrice.amountCents,
    distanceKm: HUB_DISTANCE_KM,
  };
}

/**
 * Close the loop after `buyItem()` succeeded on a return-originated listing:
 * mark the return's deal complete, walk the lifecycle to delivered_to_buyer,
 * and retire the agent. No-op for ordinary (sell-flow) listings.
 */
export function completeReturnSale(
  listingId: string,
  salePriceCents: number,
  sellerCredits: number,
): void {
  const listing = getListings().find((l) => l.id === listingId);
  const returnId = listing?.returnId;
  if (!returnId) return;

  markAgentSold(listingId, salePriceCents);
  const ret = getReturnById(returnId);
  if (!ret) return;
  const at = new Date().toISOString();
  recordTransition(returnId, { from: 'listed_local', to: 'sold', at });
  recordTransition(returnId, { from: 'sold', to: 'delivered_to_buyer', at });
  completeDeal(returnId, sellerCredits);
}
