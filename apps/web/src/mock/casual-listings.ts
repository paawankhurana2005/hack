import type { ConditionGrade, ItemCategory, MarketContext, Money } from '@reloop/shared';

export type ListingStatus = 'listed' | 'viewed' | 'matched' | 'sold' | 'recycled' | 'donated';

/** A casual second-life listing the user has put up — their lightweight seller identity. */
export interface CasualListing {
  id: string;
  title: string;
  imageUrl: string;
  listedPrice: Money;
  status: ListingStatus;
  views?: number;
  listedAt: string; // ISO
  // --- Agent metadata (optional; seeds bake it, the sell flow populates it) ---
  category?: ItemCategory;
  grade?: ConditionGrade;
  /** Lowest sustainable resale price — the rail the agent cannot cross (paise). */
  floorCents?: number;
  /** Estimated new retail (paise) — the manual-edit ceiling. */
  retailCents?: number;
  /** Simulated local-market signals the agent reasons over. */
  market?: MarketContext;
}

// No seed listings here — My Listings shows the demo seeds (seed-listings.ts) plus
// whatever the user lists through the sell flow (persisted via listings-store).
export const casualListings: CasualListing[] = [];
