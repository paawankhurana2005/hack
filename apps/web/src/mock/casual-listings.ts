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
  /**
   * The original photos the seller uploaded when the item was graded — the
   * real, as-shot condition photos that back the Product Health Card (as
   * opposed to `imageUrl`, the clean marketplace image). Shown in the listing's
   * "as-graded" gallery so a buyer can see exactly what was assessed.
   */
  gradedPhotos?: string[];
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
  // --- Spec 016: return-originated listings (born at the hub bench) ------------
  /** Set when this listing was created by dispatching a RETURN to local_resale. */
  returnId?: string;
  /** The buy-new catalog product this is an open-box unit of (open-box surface). */
  storeProductId?: string;
}

// No seed listings here — My Listings shows the demo seeds (seed-listings.ts) plus
// whatever the user lists through the sell flow (persisted via listings-store).
export const casualListings: CasualListing[] = [];
