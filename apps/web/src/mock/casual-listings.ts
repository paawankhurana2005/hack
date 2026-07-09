import {
  estimateImpact,
  type ConditionGrade,
  type ImpactEstimate,
  type ItemCategory,
  type ItemId,
  type MarketContext,
  type Money,
  type ProductHealthCard,
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

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

interface OpenBoxSeed {
  returnId: string;
  title: string;
  imageUrl: string;
  category: ItemCategory;
  grade: ConditionGrade;
  sellerId: string;
  sellerName: string;
  confidence: number;
  summary: string;
  issues: string[];
  packagingSealed: boolean;
  originalPaise: number;
  listingPaise: number;
  listedAt: string; // ISO date
  storeProductId?: string;
}

/** Spec 016/023: a return dispatched to local resale — same shape `birthAgentFromReturn`
 *  produces, laid down as a static seed so the Open Box page has content on first load. */
function openBoxListing(s: OpenBoxSeed): CasualListing {
  const itemId: ItemId = `item_ret_${s.returnId}`;
  const now = `${s.listedAt}T09:01:00.000Z`;
  const card: ProductHealthCard = {
    id: `hc_${s.returnId}`,
    productId: s.storeProductId ?? `prod_${s.returnId}`,
    itemId,
    title: s.title,
    grade: s.grade,
    confidence: s.confidence,
    summary: s.summary,
    detectedIssues: s.issues,
    authenticityVerified: true,
    packagingSealed: s.packagingSealed,
    listingPrice: inr(s.listingPaise),
    history: [
      { label: 'Graded at the doorstep', at: `${s.listedAt}T08:10:00.000Z` },
      { label: 'Driver verified at pickup', at: `${s.listedAt}T08:40:00.000Z` },
      { label: 'Hub bench verified · ready to list', at: now },
    ],
    healthCardUrl: `/card/${itemId}`,
    issuedAt: now,
  };
  return {
    id: `lst_ret_${s.returnId}`,
    itemId,
    title: s.title,
    imageUrl: s.imageUrl,
    listedPrice: inr(s.listingPaise),
    status: 'listed',
    views: 0,
    listedAt: now,
    sellerId: s.sellerId,
    sellerName: s.sellerName,
    category: s.category,
    grade: s.grade,
    originalPrice: inr(s.originalPaise),
    retailCents: s.originalPaise,
    card,
    impact: estimateImpact(s.category, inr(s.listingPaise)),
    returnId: s.returnId,
    storeProductId: s.storeProductId,
  };
}

/** Demo Open Box inventory — each reads as a real hub-dispatched return (grade,
 *  Health Card, packaging status) so /app/shop/returned has content on first load,
 *  alongside whatever a seller approves live during a demo. */
export const casualListings: CasualListing[] = [
  openBoxListing({
    returnId: 'seed_ret_macbook',
    title: 'Apple MacBook Air (M2)',
    imageUrl: '/catalog/macbook-air.jpg',
    category: 'electronics',
    grade: 'good',
    sellerId: 'seller_techbazaar',
    sellerName: 'TechBazaar',
    confidence: 0.93,
    summary: 'Changed-mind return, opened once. Light keyboard-deck marks, battery health 96%.',
    issues: ['Faint keyboard-deck marks', 'Original box not returned'],
    packagingSealed: false,
    originalPaise: 11490000, // ₹1,14,900
    listingPaise: 8200000, // ₹82,000
    listedAt: '2026-07-02',
    storeProductId: 'store_macbookair',
  }),
  openBoxListing({
    returnId: 'seed_ret_dyson',
    title: 'Dyson V10 Cordless Vacuum',
    imageUrl: '/catalog/dyson-v10.jpg',
    category: 'home',
    grade: 'like-new',
    sellerId: 'seller_urban',
    sellerName: 'UrbanThread Store',
    confidence: 0.95,
    summary: 'Factory-sealed box, customer changed mind before first use. Doorstep-graded, seal verified.',
    issues: [],
    packagingSealed: true,
    originalPaise: 3490000, // ₹34,900
    listingPaise: 2490000, // ₹24,900
    listedAt: '2026-07-05',
  }),
  openBoxListing({
    returnId: 'seed_ret_instantpot',
    title: 'Instant Pot Duo 7-in-1',
    imageUrl: '/catalog/instant-pot.jpg',
    category: 'home',
    grade: 'fair',
    sellerId: 'seller_techbazaar',
    sellerName: 'TechBazaar',
    confidence: 0.89,
    summary: 'Functional, tested at the hub bench. Scuffed lid, missing steam rack.',
    issues: ['Scuffed lid', 'Missing steam rack'],
    packagingSealed: false,
    originalPaise: 899900, // ₹8,999
    listingPaise: 450000, // ₹4,500
    listedAt: '2026-06-28',
  }),
  // The live demo return (apps/api demo:blue-dunk seeds DEMO-BLUE-DUNK-001 in
  // Mongo and cascades the offer to nearby buyers). Their notification
  // deep-links here, to `lst_ret_DEMO-BLUE-DUNK-001`. Grade, confidence and
  // summary are what ai-grading actually returned for these photos
  // (condition score 0.918 -> like-new); the price is the engine's offer.
  openBoxListing({
    returnId: 'DEMO-BLUE-DUNK-001',
    title: 'Nike Dunk Low Retro — White / Armory Navy',
    imageUrl: '/catalog/official-nike-dunk.jpg',
    category: 'sports',
    grade: 'like-new',
    sellerId: 'seller_urban',
    sellerName: 'UrbanThread',
    confidence: 0.71,
    summary: 'Condition score 0.92 (like-new). Graded at the doorstep before the item moved.',
    issues: [],
    packagingSealed: false,
    originalPaise: 929500, // ₹9,295
    listingPaise: 531700, // ₹5,317 — the matching engine's offered price
    listedAt: '2026-07-09',
  }),
];
