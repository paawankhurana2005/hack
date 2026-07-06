// Exchange pipeline: returned products routed to local_resale with dynamic pricing + buyer matching.

/** Default rescue window for a newly created local-routing listing (hours). */
export const RESCUE_WINDOW_HOURS = 48;

export interface MatchedBuyer {
  buyerId: string;
  name: string;
  distanceKm: number;
  matchReason: 'searched' | 'wishlisted' | 'purchased_similar';
  matchScore: number; // 0..1
  notifiedAt: string;
  responded: boolean;
  avatar: string; // initials
  city?: string;
  accountAgeDays?: number;
  totalOrders?: number;
  buyerRating?: number;
}

export interface ExchangeItem {
  returnId: string;
  productName: string;
  category: string;
  grade: 'A' | 'B' | 'C';
  originalPriceCents: number;
  basePriceCents: number;
  floorPriceCents: number;
  similarListingsNearby: number;
  rescueWindowHours: number;
  rescueStartedAt: string; // ISO
  matchedBuyers: MatchedBuyer[];
  status: 'live' | 'matched' | 'deal_pending';
  radiusKm: number;
  source?: 'local_routing';
  co2SavedKg?: number;
  distanceSavedKm?: number;
  imageUrl?: string;
}

// Grade multipliers for base price calculation
const GRADE_MULTIPLIER: Record<'A' | 'B' | 'C', number> = { A: 0.72, B: 0.54, C: 0.38 };

/** Deterministic pricing engine — grade × demand × time decay. */
export function computeCurrentPrice(item: ExchangeItem, simulatedOffsetHours = 0): number {
  const hoursElapsed =
    (Date.now() - new Date(item.rescueStartedAt).getTime()) / 3600000 + simulatedOffsetHours;
  const progress = Math.min(hoursElapsed / item.rescueWindowHours, 1);

  // More competition → steeper decay
  const competitionFactor = Math.min(item.similarListingsNearby / 20, 1);

  // Time decay: max 40% off base over the rescue window; competition adds up to 20% more
  const decayPct = progress * 0.4 + competitionFactor * 0.2 * progress;

  const computed = Math.round(item.basePriceCents * (1 - decayPct));
  return Math.max(computed, item.floorPriceCents);
}

/** Percentage of rescue window elapsed (0..1). */
export function rescueProgress(item: ExchangeItem, simulatedOffsetHours = 0): number {
  const hoursElapsed =
    (Date.now() - new Date(item.rescueStartedAt).getTime()) / 3600000 + simulatedOffsetHours;
  return Math.min(hoursElapsed / item.rescueWindowHours, 1);
}

/** Hours remaining on rescue window (clamped to 0). */
export function hoursRemaining(item: ExchangeItem, simulatedOffsetHours = 0): number {
  const hoursElapsed =
    (Date.now() - new Date(item.rescueStartedAt).getTime()) / 3600000 + simulatedOffsetHours;
  return Math.max(item.rescueWindowHours - hoursElapsed, 0);
}

// ─── Local routing listings (localStorage-backed) ─────────────────────────────

const LOCAL_ROUTING_KEY = 'reloop_local_routing_v1';

const BUYER_POOL: Array<Pick<MatchedBuyer, 'name' | 'avatar' | 'buyerId' | 'city' | 'accountAgeDays' | 'totalOrders' | 'buyerRating'>> = [
  { name: 'Arjun Mehta',    avatar: 'AM', buyerId: 'AMZ-7K2PA', city: 'Koramangala, Bengaluru',    accountAgeDays: 1247, totalOrders: 847,  buyerRating: 4.9 },
  { name: 'Priya Sharma',   avatar: 'PS', buyerId: 'AMZ-9X3PR', city: 'Indiranagar, Bengaluru',    accountAgeDays: 892,  totalOrders: 312,  buyerRating: 4.7 },
  { name: 'Sneha Iyer',     avatar: 'SI', buyerId: 'AMZ-4B8QS', city: 'HSR Layout, Bengaluru',     accountAgeDays: 2103, totalOrders: 156,  buyerRating: 4.8 },
  { name: 'Kabir Nair',     avatar: 'KN', buyerId: 'AMZ-2N7KX', city: 'Whitefield, Bengaluru',     accountAgeDays: 380,  totalOrders: 89,   buyerRating: 4.6 },
  { name: 'Divya Krishnan', avatar: 'DK', buyerId: 'AMZ-6D9KR', city: 'JP Nagar, Bengaluru',       accountAgeDays: 1840, totalOrders: 1204, buyerRating: 5.0 },
  { name: 'Riya Agarwal',   avatar: 'RA', buyerId: 'AMZ-5R3AG', city: 'Jayanagar, Bengaluru',      accountAgeDays: 714,  totalOrders: 201,  buyerRating: 4.6 },
  { name: 'Aditya Bose',    avatar: 'AB', buyerId: 'AMZ-8A2BO', city: 'BTM Layout, Bengaluru',     accountAgeDays: 1125, totalOrders: 423,  buyerRating: 4.8 },
  { name: 'Meera Patel',    avatar: 'MP', buyerId: 'AMZ-3M9PT', city: 'Electronic City, Bengaluru',accountAgeDays: 420,  totalOrders: 67,   buyerRating: 4.4 },
];

const MATCH_REASONS: MatchedBuyer['matchReason'][] = ['wishlisted', 'searched', 'purchased_similar'];

// Spec 023: approximate Bengaluru-neighborhood coordinates for the nearby-buyers
// map — illustrative demo data (mirrors the pattern in apps/api's regionCluster.ts
// pincode table), keyed by the neighborhood name every `MatchedBuyer.city` here
// starts with (e.g. "Koramangala, Bengaluru" → "Koramangala").
const NEIGHBORHOOD_COORDS: Record<string, { lat: number; lng: number }> = {
  Koramangala: { lat: 12.9352, lng: 77.6146 },
  Indiranagar: { lat: 12.9719, lng: 77.6412 },
  'HSR Layout': { lat: 12.9121, lng: 77.6446 },
  Whitefield: { lat: 12.9698, lng: 77.75 },
  'JP Nagar': { lat: 12.9077, lng: 77.5851 },
  Jayanagar: { lat: 12.9308, lng: 77.5838 },
  'BTM Layout': { lat: 12.9166, lng: 77.6101 },
  'Electronic City': { lat: 12.8452, lng: 77.6602 },
  Malleshwaram: { lat: 13.0037, lng: 77.5709 },
  Marathahalli: { lat: 12.9569, lng: 77.7011 },
  Banaswadi: { lat: 13.0143, lng: 77.6512 },
  Rajajinagar: { lat: 12.9915, lng: 77.5522 },
  Yelahanka: { lat: 13.1007, lng: 77.5963 },
};
const BENGALURU_CENTER = { lat: 12.9716, lng: 77.5946 };

/** Approximate lat/lng for a buyer's neighborhood, for the nearby-buyers map. */
export function coordsForBuyer(buyer: Pick<MatchedBuyer, 'city'>): { lat: number; lng: number } {
  const neighborhood = buyer.city?.split(',')[0]?.trim();
  const coords = neighborhood ? NEIGHBORHOOD_COORDS[neighborhood] : undefined;
  return coords ?? BENGALURU_CENTER;
}

function generateLocalBuyers(count: number, radiusKm: number): MatchedBuyer[] {
  const n = Math.min(count, BUYER_POOL.length);
  return BUYER_POOL.slice(0, n).map((b, i) => ({
    buyerId: b.buyerId,
    name: b.name,
    avatar: b.avatar,
    city: b.city,
    accountAgeDays: b.accountAgeDays,
    totalOrders: b.totalOrders,
    buyerRating: b.buyerRating,
    distanceKm: parseFloat((radiusKm * (0.1 + i * 0.11)).toFixed(1)),
    matchReason: MATCH_REASONS[i % 3]!,
    matchScore: parseFloat((0.97 - i * 0.05).toFixed(2)),
    notifiedAt: new Date(Date.now() - (i + 1) * 4 * 60000).toISOString(),
    responded: i < 2,
  }));
}

export function getLocalRoutingListings(): ExchangeItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_ROUTING_KEY);
    return raw ? (JSON.parse(raw) as ExchangeItem[]) : [];
  } catch {
    return [];
  }
}

function saveLocalRoutingListing(item: ExchangeItem): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalRoutingListings();
    const idx = existing.findIndex((i) => i.returnId === item.returnId);
    if (idx >= 0) { existing[idx] = item; } else { existing.unshift(item); }
    localStorage.setItem(LOCAL_ROUTING_KEY, JSON.stringify(existing));
  } catch {
    // silently fail
  }
}

export function createLocalRoutingListing(params: {
  returnId: string;
  productName: string;
  category: string;
  grade: 'A' | 'B' | 'C';
  priceCents: number;
  nearbyBuyers: number;
  radiusKm: number;
  co2SavedKg: number;
  distanceSavedKm: number;
  imageUrl?: string;
}): void {
  const item: ExchangeItem = {
    returnId: params.returnId,
    productName: params.productName,
    category: params.category,
    grade: params.grade,
    originalPriceCents: params.priceCents,
    basePriceCents: params.priceCents,
    floorPriceCents: Math.round(params.priceCents * 0.5),
    similarListingsNearby: 0,
    rescueWindowHours: RESCUE_WINDOW_HOURS,
    rescueStartedAt: new Date().toISOString(),
    radiusKm: params.radiusKm,
    status: 'matched',
    source: 'local_routing',
    co2SavedKg: params.co2SavedKg,
    distanceSavedKm: params.distanceSavedKm,
    matchedBuyers: generateLocalBuyers(params.nearbyBuyers, params.radiusKm),
    imageUrl: params.imageUrl,
  };
  saveLocalRoutingListing(item);
}

// ─── Seeded exchange items ─────────────────────────────────────────────────────
const now = Date.now();

export const EXCHANGE_ITEMS: ExchangeItem[] = [
  {
    returnId: 'RET-2026-800001',
    productName: 'Fire HD 10 Tablet (32GB)',
    category: 'Electronics',
    imageUrl: '/catalog/fire-tablet.jpg',
    grade: 'A',
    originalPriceCents: 699900,
    basePriceCents: Math.round(699900 * GRADE_MULTIPLIER.A),
    floorPriceCents: Math.round(699900 * 0.25),
    similarListingsNearby: 3,
    rescueWindowHours: 48,
    rescueStartedAt: new Date(now - 8 * 3600000).toISOString(), // 8h ago → lots of time left
    radiusKm: 15,
    status: 'live',
    matchedBuyers: [
      {
        buyerId: 'AMZ-7K2PA', name: 'Arjun Mehta', avatar: 'AM',
        city: 'Koramangala, Bengaluru', accountAgeDays: 1247, totalOrders: 847, buyerRating: 4.9,
        distanceKm: 2.1, matchReason: 'wishlisted', matchScore: 0.96,
        notifiedAt: new Date(now - 25 * 60000).toISOString(), responded: true,
      },
      {
        buyerId: 'AMZ-9X3PR', name: 'Priya Sharma', avatar: 'PS',
        city: 'Indiranagar, Bengaluru', accountAgeDays: 892, totalOrders: 312, buyerRating: 4.7,
        distanceKm: 4.8, matchReason: 'searched', matchScore: 0.89,
        notifiedAt: new Date(now - 18 * 60000).toISOString(), responded: false,
      },
      {
        buyerId: 'AMZ-1R4VH', name: 'Rohan Verma', avatar: 'RV',
        city: 'Malleshwaram, Bengaluru', accountAgeDays: 645, totalOrders: 127, buyerRating: 4.5,
        distanceKm: 7.3, matchReason: 'purchased_similar', matchScore: 0.74,
        notifiedAt: new Date(now - 12 * 60000).toISOString(), responded: false,
      },
      {
        buyerId: 'AMZ-4B8QS', name: 'Sneha Iyer', avatar: 'SI',
        city: 'HSR Layout, Bengaluru', accountAgeDays: 2103, totalOrders: 156, buyerRating: 4.8,
        distanceKm: 9.6, matchReason: 'searched', matchScore: 0.68,
        notifiedAt: new Date(now - 8 * 60000).toISOString(), responded: false,
      },
      {
        buyerId: 'AMZ-2N7KX', name: 'Kabir Nair', avatar: 'KN',
        city: 'Whitefield, Bengaluru', accountAgeDays: 380, totalOrders: 89, buyerRating: 4.6,
        distanceKm: 11.2, matchReason: 'wishlisted', matchScore: 0.61,
        notifiedAt: new Date(now - 4 * 60000).toISOString(), responded: false,
      },
    ],
  },
  {
    returnId: 'RET-2026-EX002',
    productName: 'Sony WH-1000XM5 Headphones',
    category: 'Electronics',
    imageUrl: '/catalog/wh1000xm5.jpg',
    grade: 'B',
    originalPriceCents: 2999900,
    basePriceCents: Math.round(2999900 * GRADE_MULTIPLIER.B),
    floorPriceCents: Math.round(2999900 * 0.2),
    similarListingsNearby: 7,
    rescueWindowHours: 36,
    rescueStartedAt: new Date(now - 19 * 3600000).toISOString(), // 19h in → urgency building
    radiusKm: 15,
    status: 'matched',
    matchedBuyers: [
      {
        buyerId: 'AMZ-6D9KR', name: 'Divya Krishnan', avatar: 'DK',
        city: 'JP Nagar, Bengaluru', accountAgeDays: 1840, totalOrders: 1204, buyerRating: 5.0,
        distanceKm: 1.4, matchReason: 'searched', matchScore: 0.98,
        notifiedAt: new Date(now - 45 * 60000).toISOString(), responded: true,
      },
      {
        buyerId: 'AMZ-8A2BO', name: 'Aditya Bose', avatar: 'AB',
        city: 'BTM Layout, Bengaluru', accountAgeDays: 1125, totalOrders: 423, buyerRating: 4.8,
        distanceKm: 5.9, matchReason: 'wishlisted', matchScore: 0.83,
        notifiedAt: new Date(now - 30 * 60000).toISOString(), responded: true,
      },
      {
        buyerId: 'AMZ-3M9PT', name: 'Meera Patel', avatar: 'MP',
        city: 'Marathahalli, Bengaluru', accountAgeDays: 420, totalOrders: 67, buyerRating: 4.4,
        distanceKm: 8.2, matchReason: 'purchased_similar', matchScore: 0.71,
        notifiedAt: new Date(now - 20 * 60000).toISOString(), responded: false,
      },
    ],
  },
  {
    returnId: 'RET-2026-EX003',
    productName: 'Samsung Galaxy S24 FE',
    category: 'Electronics',
    imageUrl: '/catalog/galaxy-phone.jpg',
    grade: 'B',
    originalPriceCents: 4999900,
    basePriceCents: Math.round(4999900 * GRADE_MULTIPLIER.B),
    floorPriceCents: Math.round(4999900 * 0.2),
    similarListingsNearby: 12,
    rescueWindowHours: 48,
    rescueStartedAt: new Date(now - 38 * 3600000).toISOString(), // 38h in → urgent, price falling fast
    radiusKm: 15,
    status: 'deal_pending',
    matchedBuyers: [
      {
        buyerId: 'AMZ-5VJ2K', name: 'Vikram Joshi', avatar: 'VJ',
        city: 'Banaswadi, Bengaluru', accountAgeDays: 1560, totalOrders: 689, buyerRating: 4.9,
        distanceKm: 3.7, matchReason: 'searched', matchScore: 0.94,
        notifiedAt: new Date(now - 60 * 60000).toISOString(), responded: true,
      },
      {
        buyerId: 'AMZ-7AS9P', name: 'Ananya Singh', avatar: 'AS',
        city: 'Rajajinagar, Bengaluru', accountAgeDays: 728, totalOrders: 245, buyerRating: 4.7,
        distanceKm: 6.4, matchReason: 'wishlisted', matchScore: 0.88,
        notifiedAt: new Date(now - 55 * 60000).toISOString(), responded: true,
      },
      {
        buyerId: 'AMZ-4RG6X', name: 'Rahul Gupta', avatar: 'RG',
        city: 'Yelahanka, Bengaluru', accountAgeDays: 215, totalOrders: 34, buyerRating: 4.3,
        distanceKm: 12.1, matchReason: 'purchased_similar', matchScore: 0.65,
        notifiedAt: new Date(now - 40 * 60000).toISOString(), responded: false,
      },
    ],
  },
];
