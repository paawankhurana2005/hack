import type { ReturnGradingResult, ReturnRoutingDecision, ReturnReason } from '@reloop/shared';

export interface SubmittedReturn {
  returnId: string;
  orderId: string;
  productName: string;
  category: string;
  priceCents: number;
  reason: ReturnReason;
  photoCount: number;
  gradingResult: ReturnGradingResult | null;
  routingDecision: ReturnRoutingDecision | null;
  submittedAt: string;
  agentArrivesAt: string;
  status: 'awaiting_pickup' | 'in_transit' | 'processed';
}

const STORAGE_KEY = 'reloop_returns_v1';

// Pre-seeded returns — always visible on the seller dashboard
export const SEEDED_RETURNS: SubmittedReturn[] = [
  {
    returnId: 'RET-2026-800001',
    orderId: 'ORD-5501',
    productName: 'Fire HD 10 Tablet (32GB)',
    category: 'electronics',
    priceCents: 699900,
    reason: 'defective',
    photoCount: 3,
    submittedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    agentArrivesAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    status: 'in_transit',
    gradingResult: {
      grade: 'A',
      confidence: 0.92,
      defects: ['Minor scratch on screen bezel'],
      authenticityMatch: true,
      wardrobingFlag: false,
      functionallyVerifiable: true,
      rawReason: 'defective',
    },
    routingDecision: {
      decision: 'local_resale',
      reasoning:
        'Amazon found 8 verified buyers within 4km who want this item. Local handling cost ₹380 vs ₹1,240 for a 580km warehouse round-trip — net saving ₹860. Item stays local; refund is unaffected.',
      co2SavedKg: 2.4,
      dwellBudgetHours: 48,
      sellerType: '1P',
      fallbackChain: ['donate', 'recycle'],
      nearbyBuyers: 8,
      radiusKm: 4,
      warehouseDistanceKm: 580,
      warehouseMargin: -480,
      localMargin: 2119,
    },
  },
  {
    returnId: 'RET-2026-800002',
    orderId: 'ORD-5502',
    productName: 'Echo Dot (5th Gen)',
    category: 'electronics',
    priceCents: 499900,
    reason: 'stopped_working',
    photoCount: 2,
    submittedAt: new Date(Date.now() - 26 * 3600000).toISOString(),
    agentArrivesAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    status: 'processed',
    gradingResult: {
      grade: 'B',
      confidence: 0.84,
      defects: ['Cosmetic wear on base', 'Speaker mesh slightly dented'],
      authenticityMatch: true,
      wardrobingFlag: false,
      functionallyVerifiable: false,
      rawReason: 'stopped_working',
    },
    routingDecision: {
      decision: 'refurbish',
      reasoning:
        'Minor cosmetic wear detected. A certified refurbishment partner 3km away can restore resale value from ₹2,800 to ₹4,200 — net margin ₹1,400 vs a projected loss of ₹440 via warehouse return. Item will not travel 580km.',
      co2SavedKg: 1.2,
      dwellBudgetHours: 72,
      sellerType: '1P',
      fallbackChain: ['donate', 'recycle'],
      warehouseDistanceKm: 580,
      warehouseMargin: -440,
      localMargin: 1400,
    },
  },
  {
    returnId: 'RET-2026-800003',
    orderId: 'ORD-5503',
    productName: 'Kindle Paperwhite (16GB)',
    category: 'electronics',
    priceCents: 149900,
    reason: 'changed_mind',
    photoCount: 4,
    submittedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    agentArrivesAt: new Date(Date.now() - 45 * 3600000).toISOString(),
    status: 'processed',
    gradingResult: {
      grade: 'C',
      confidence: 0.78,
      defects: ['Significant screen scratches', 'Cover damaged', 'Charging port loose'],
      authenticityMatch: true,
      wardrobingFlag: false,
      functionallyVerifiable: true,
      rawReason: 'changed_mind',
    },
    routingDecision: {
      decision: 'donate',
      reasoning:
        'Local resale margin after handling cost is ₹120 — below the ₹300 viability threshold. 2 verified NGO partners within 5km accept this category. Donating locally avoids 580km of freight and maximises social impact.',
      co2SavedKg: 0.8,
      dwellBudgetHours: 48,
      sellerType: '1P',
      fallbackChain: ['recycle'],
      warehouseDistanceKm: 580,
    },
  },
];

const SEEDED_IDS = new Set(SEEDED_RETURNS.map((r) => r.returnId));

export function getSubmittedReturns(): SubmittedReturn[] {
  if (typeof window === 'undefined') return SEEDED_RETURNS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: SubmittedReturn[] = raw ? (JSON.parse(raw) as SubmittedReturn[]) : [];
    const userReturns = saved.filter((r) => !SEEDED_IDS.has(r.returnId));
    return [...userReturns, ...SEEDED_RETURNS];
  } catch {
    return SEEDED_RETURNS;
  }
}

export function getReturnById(returnId: string): SubmittedReturn | null {
  return getSubmittedReturns().find((r) => r.returnId === returnId) ?? null;
}

export function saveReturn(r: SubmittedReturn): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: SubmittedReturn[] = raw ? (JSON.parse(raw) as SubmittedReturn[]) : [];
    const idx = saved.findIndex((s) => s.returnId === r.returnId);
    if (idx >= 0) {
      saved[idx] = r;
    } else {
      saved.unshift(r);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // silently fail
  }
}

export function generateReturnId(): string {
  return `RET-2026-${Math.floor(100000 + Math.random() * 900000)}`;
}
