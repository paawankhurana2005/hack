// Demo persistence for casual listings created at the end of the sell flow.
// localStorage-backed (no backend). Stored listings are merged ahead of the seed
// mock so a freshly listed item shows up at the top of My Listings.

import { casualListings, type CasualListing } from '@/mock/casual-listings';

const KEY = 'reloop.listings';

function readStored(): CasualListing[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CasualListing[]) : [];
  } catch {
    return [];
  }
}

/** User-created listings first (newest), then the seed mock. */
export function getListings(): CasualListing[] {
  return [...readStored(), ...casualListings];
}

export function addListing(listing: CasualListing): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([listing, ...readStored()]));
  } catch {
    /* storage blocked — listing simply won't persist; flow still completes */
  }
}
