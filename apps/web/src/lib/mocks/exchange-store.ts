// Exchange pipeline: returned products routed to local_resale with dynamic pricing + buyer matching.

export interface MatchedBuyer {
  buyerId: string;
  name: string;
  distanceKm: number;
  matchReason: 'searched' | 'wishlisted' | 'purchased_similar';
  matchScore: number; // 0..1
  notifiedAt: string;
  responded: boolean;
  avatar: string; // initials
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

const BUYER_POOL: Array<{ name: string; avatar: string }> = [
  { name: 'Arjun Mehta', avatar: 'AM' },
  { name: 'Priya Sharma', avatar: 'PS' },
  { name: 'Sneha Iyer', avatar: 'SI' },
  { name: 'Kabir Nair', avatar: 'KN' },
  { name: 'Divya Krishnan', avatar: 'DK' },
  { name: 'Riya Agarwal', avatar: 'RA' },
  { name: 'Aditya Bose', avatar: 'AB' },
  { name: 'Meera Patel', avatar: 'MP' },
];

const MATCH_REASONS: MatchedBuyer['matchReason'][] = ['wishlisted', 'searched', 'purchased_similar'];

function generateLocalBuyers(count: number, radiusKm: number): MatchedBuyer[] {
  const n = Math.min(count, BUYER_POOL.length);
  return BUYER_POOL.slice(0, n).map((b, i) => ({
    buyerId: `LR-${i + 1}`,
    name: b.name,
    avatar: b.avatar,
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
    rescueWindowHours: 48,
    rescueStartedAt: new Date().toISOString(),
    radiusKm: params.radiusKm,
    status: 'matched',
    source: 'local_routing',
    co2SavedKg: params.co2SavedKg,
    distanceSavedKm: params.distanceSavedKm,
    matchedBuyers: generateLocalBuyers(params.nearbyBuyers, params.radiusKm),
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
        buyerId: 'BUY-001',
        name: 'Arjun Mehta',
        distanceKm: 2.1,
        matchReason: 'wishlisted',
        matchScore: 0.96,
        notifiedAt: new Date(now - 25 * 60000).toISOString(),
        responded: true,
        avatar: 'AM',
      },
      {
        buyerId: 'BUY-002',
        name: 'Priya Sharma',
        distanceKm: 4.8,
        matchReason: 'searched',
        matchScore: 0.89,
        notifiedAt: new Date(now - 18 * 60000).toISOString(),
        responded: false,
        avatar: 'PS',
      },
      {
        buyerId: 'BUY-003',
        name: 'Rohan Verma',
        distanceKm: 7.3,
        matchReason: 'purchased_similar',
        matchScore: 0.74,
        notifiedAt: new Date(now - 12 * 60000).toISOString(),
        responded: false,
        avatar: 'RV',
      },
      {
        buyerId: 'BUY-004',
        name: 'Sneha Iyer',
        distanceKm: 9.6,
        matchReason: 'searched',
        matchScore: 0.68,
        notifiedAt: new Date(now - 8 * 60000).toISOString(),
        responded: false,
        avatar: 'SI',
      },
      {
        buyerId: 'BUY-005',
        name: 'Kabir Nair',
        distanceKm: 11.2,
        matchReason: 'wishlisted',
        matchScore: 0.61,
        notifiedAt: new Date(now - 4 * 60000).toISOString(),
        responded: false,
        avatar: 'KN',
      },
    ],
  },
  {
    returnId: 'RET-2026-EX002',
    productName: 'Sony WH-1000XM5 Headphones',
    category: 'Electronics',
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
        buyerId: 'BUY-006',
        name: 'Divya Krishnan',
        distanceKm: 1.4,
        matchReason: 'searched',
        matchScore: 0.98,
        notifiedAt: new Date(now - 45 * 60000).toISOString(),
        responded: true,
        avatar: 'DK',
      },
      {
        buyerId: 'BUY-007',
        name: 'Aditya Bose',
        distanceKm: 5.9,
        matchReason: 'wishlisted',
        matchScore: 0.83,
        notifiedAt: new Date(now - 30 * 60000).toISOString(),
        responded: true,
        avatar: 'AB',
      },
      {
        buyerId: 'BUY-008',
        name: 'Meera Patel',
        distanceKm: 8.2,
        matchReason: 'purchased_similar',
        matchScore: 0.71,
        notifiedAt: new Date(now - 20 * 60000).toISOString(),
        responded: false,
        avatar: 'MP',
      },
    ],
  },
  {
    returnId: 'RET-2026-EX003',
    productName: 'Samsung Galaxy S24 FE',
    category: 'Electronics',
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
        buyerId: 'BUY-009',
        name: 'Vikram Joshi',
        distanceKm: 3.7,
        matchReason: 'searched',
        matchScore: 0.94,
        notifiedAt: new Date(now - 60 * 60000).toISOString(),
        responded: true,
        avatar: 'VJ',
      },
      {
        buyerId: 'BUY-010',
        name: 'Ananya Singh',
        distanceKm: 6.4,
        matchReason: 'wishlisted',
        matchScore: 0.88,
        notifiedAt: new Date(now - 55 * 60000).toISOString(),
        responded: true,
        avatar: 'AS',
      },
      {
        buyerId: 'BUY-011',
        name: 'Rahul Gupta',
        distanceKm: 12.1,
        matchReason: 'purchased_similar',
        matchScore: 0.65,
        notifiedAt: new Date(now - 40 * 60000).toISOString(),
        responded: false,
        avatar: 'RG',
      },
    ],
  },
];
