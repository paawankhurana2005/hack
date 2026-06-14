import type {
  ConditionGrade,
  ImpactEstimate,
  ItemCategory,
  ItemId,
  MarketContext,
  Money,
  ProductHealthCard,
} from '@reloop/shared';

export type ListingStatus = 'listed' | 'viewed' | 'matched' | 'sold' | 'recycled' | 'donated';

/** A casual second-life listing the user has put up — their lightweight seller identity. */
export interface CasualListing {
  id: string;
  /** The physical item behind this listing — the key into its provenance chain. */
  itemId?: ItemId;
  title: string;
  imageUrl: string;
  listedPrice: Money;
  status: ListingStatus;
  views?: number;
  listedAt: string; // ISO
  /** The account that owns this listing (whose My Listings it shows in). */
  sellerId?: string;
  sellerName?: string;
  /** The owned item this listing was created from (links back to My Items). */
  sourceItemId?: string;
  // --- Agent metadata (optional; seeds bake it, the sell flow populates it) ---
  category?: ItemCategory;
  grade?: ConditionGrade;
  /** Lowest sustainable resale price — the rail the agent cannot cross (paise). */
  floorCents?: number;
  /** Estimated new retail (paise) — the manual-edit ceiling. */
  retailCents?: number;
  /** Simulated local-market signals the agent reasons over. */
  market?: MarketContext;
  // --- Shop-rendering data (present once the listing is buyable by others) -----
  originalPrice?: Money;
  card?: ProductHealthCard;
  impact?: ImpactEstimate;
}

// No seed listings here — My Listings shows the demo seeds (seed-listings.ts) plus
// whatever the user lists through the sell flow (persisted via listings-store).
export const casualListings: CasualListing[] = [];
