import type { Money } from '@reloop/shared';

export type ListingStatus = 'listed' | 'viewed' | 'matched' | 'sold';

/** A casual second-life listing the user has put up — their lightweight seller identity. */
export interface CasualListing {
  id: string;
  title: string;
  imageUrl: string;
  listedPrice: Money;
  status: ListingStatus;
  views?: number;
  listedAt: string; // ISO
}

// No seed listings — My Listings shows only what the user actually lists through
// the sell flow (persisted to localStorage via listings-store).
export const casualListings: CasualListing[] = [];
