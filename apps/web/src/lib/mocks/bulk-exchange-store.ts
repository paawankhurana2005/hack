// Spec 016.1: this store now sits on the deterministic lot engine in
// @reloop/shared/liquidation-lot — bid curves + manifest premium + ship-vs-wait
// decide; there is no Math.random anywhere in the pricing path. localStorage
// persistence and the BulkBatch/BulkMatch shapes are unchanged (the page
// renders the same fields).

import {
  bestBuyer,
  lotValueCents,
  secondBestBuyer,
  shipNowOrWait,
  type Grade,
  type ItemCategory,
  type LotBuyerType,
  type LotComposition,
  type LotValue,
} from '@reloop/shared';

export type BatchStatus =
  | 'staging' // spec 016.1: open hub pallet, filling from routed returns
  | 'pending_approval'
  | 'partially_matched'
  | 'approved'
  | 'completed';

export interface BulkMatch {
  buyerName: string;
  buyerType: string;
  buyerLocation: string;
  matchedUnits: number;
  dealValue: number;
  amazonCut: number;
  sellerEarnings: number;
  co2SavedKg: number;
  pickupDate: string;
}

export interface BulkBatch {
  id: string;
  category: string;
  description: string;
  units: number;
  preferredOutcome: string;
  submittedAt: string;
  grades: { A: number; B: number; C: number; D: number };
  status: BatchStatus;
  primaryMatch: BulkMatch | null;
  remainingUnits: number;
  remainingNote: string | null;
  approvedAt?: string;
  completedAt?: string;
  ecoCreditsAwarded?: number;
  /** Spec 016.1: mean clearing price across staged units (paise) — engine input. */
  avgClearingCents?: number;
  /** Spec 016.1: Health-Card manifest coverage of the lot (0–1). */
  manifestCoverage?: number;
}

const STORAGE_KEY = 'reloop_bulk_v1';

export const SEEDED_BATCHES: BulkBatch[] = [
  {
    id: 'BLK-2024-0091',
    category: 'Consumer Electronics',
    description: '200 units (mixed — laptops, tablets, chargers)',
    units: 200,
    preferredOutcome: 'Resale preferred',
    submittedAt: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
    grades: { A: 110, B: 60, C: 30, D: 0 },
    status: 'pending_approval',
    primaryMatch: {
      buyerName: 'Renew Tech Solutions',
      buyerType: 'Verified Refurbisher',
      buyerLocation: 'Mumbai',
      matchedUnits: 200,
      dealValue: 420000,
      amazonCut: 42000,
      sellerEarnings: 378000,
      co2SavedKg: 8.4,
      pickupDate: '18 Jun 2025',
    },
    remainingUnits: 0,
    remainingNote: null,
  },
  {
    id: 'BLK-2024-0087',
    category: 'Home Appliances',
    description: '85 units (ACs, geysers, fans)',
    units: 85,
    preferredOutcome: 'Let AI decide',
    submittedAt: new Date(Date.now() - 9 * 24 * 3600000).toISOString(),
    grades: { A: 20, B: 40, C: 25, D: 0 },
    status: 'partially_matched',
    primaryMatch: {
      buyerName: 'GreenHome NGO',
      buyerType: 'NGO Donation Partner',
      buyerLocation: 'Pune',
      matchedUnits: 25,
      dealValue: 0,
      amazonCut: 0,
      sellerEarnings: 0,
      co2SavedKg: 2.1,
      pickupDate: '19 Jun 2025',
    },
    remainingUnits: 60,
    remainingNote: '60 Grade A/B units — expanding buyer search radius to 50km',
  },
  {
    id: 'BLK-2024-0081',
    category: 'Kitchen Appliances',
    description: '120 units (mixers, OTGs, induction cooktops)',
    units: 120,
    preferredOutcome: 'Resale preferred',
    submittedAt: new Date(Date.now() - 17 * 24 * 3600000).toISOString(),
    grades: { A: 80, B: 30, C: 0, D: 10 },
    status: 'completed',
    primaryMatch: {
      buyerName: 'QuickResale Pvt Ltd',
      buyerType: 'Verified Wholesaler',
      buyerLocation: 'Nashik',
      matchedUnits: 120,
      dealValue: 285000,
      amazonCut: 28500,
      sellerEarnings: 256500,
      co2SavedKg: 5.2,
      pickupDate: '8 Jun 2025',
    },
    remainingUnits: 0,
    remainingNote: null,
    approvedAt: new Date(Date.now() - 14 * 24 * 3600000).toISOString(),
    completedAt: new Date(Date.now() - 6 * 24 * 3600000).toISOString(),
    ecoCreditsAwarded: 94,
  },
];

const SEEDED_IDS = new Set(SEEDED_BATCHES.map((b) => b.id));

export function getBatches(): BulkBatch[] {
  if (typeof window === 'undefined') return SEEDED_BATCHES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: BulkBatch[] = raw ? (JSON.parse(raw) as BulkBatch[]) : [];
    const userBatches = saved.filter((b) => !SEEDED_IDS.has(b.id));
    const savedById = new Map(saved.map((b) => [b.id, b]));
    const seededWithOverrides = SEEDED_BATCHES.map((b) => savedById.get(b.id) ?? b);
    return [...userBatches, ...seededWithOverrides];
  } catch {
    return SEEDED_BATCHES;
  }
}

function persistBatch(b: BulkBatch): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: BulkBatch[] = raw ? (JSON.parse(raw) as BulkBatch[]) : [];
    const idx = saved.findIndex((s) => s.id === b.id);
    if (idx >= 0) saved[idx] = b;
    else saved.unshift(b);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {}
}

export function addBatch(b: BulkBatch): void {
  persistBatch(b);
}

export function updateBatch(id: string, patch: Partial<BulkBatch>): BulkBatch | null {
  const all = getBatches();
  const target = all.find((b) => b.id === id);
  if (!target) return null;
  const updated = { ...target, ...patch };
  persistBatch(updated);
  return updated;
}

export function generateBatchId(): string {
  // Deterministic-enough and collision-free for the demo; no Math.random.
  return `BLK-2026-${Date.now() % 100000}`;
}

export function generateGrades(
  units: number,
  category: string,
): { A: number; B: number; C: number; D: number } {
  const isElec = /electron|laptop|tablet|phone|gadget/i.test(category);
  const A = Math.round(units * (isElec ? 0.52 : 0.65));
  const B = Math.round(units * (isElec ? 0.28 : 0.22));
  const C = Math.round(units * (isElec ? 0.15 : 0.1));
  const D = Math.max(0, units - A - B - C);
  return { A, B, C, D };
}

// --- Engine adapters -------------------------------------------------------------

function toItemCategory(category: string): ItemCategory {
  if (/electron|laptop|tablet|phone|gadget/i.test(category)) return 'electronics';
  if (/fashion|cloth|apparel|wear|shoe/i.test(category)) return 'fashion';
  if (/home|kitchen|appliance|furniture/i.test(category)) return 'home';
  if (/sport|fitness|gym/i.test(category)) return 'sports';
  if (/toy|game/i.test(category)) return 'toys';
  if (/book/i.test(category)) return 'books';
  return 'other';
}

// Mean clearing price per unit by category (paise) — SKU-prefix-style mock,
// same role as getPricing in the API's routing adapter.
const CLEARING_PER_UNIT_CENTS: Record<ItemCategory, number> = {
  electronics: 500_000, // ₹5,000
  home: 250_000,
  sports: 200_000,
  toys: 120_000,
  fashion: 120_000,
  books: 60_000,
  other: 200_000,
};

// Batches submitted through the seller form are AI-graded (near-full manifest);
// hub-staged pallets are bench-verified (full manifest).
const SUBMITTED_MANIFEST_COVERAGE = 0.9;
const HUB_MANIFEST_COVERAGE = 1;

function toLot(
  grades: { A: number; B: number; C: number; D: number },
  category: string,
  avgClearingCents: number,
  manifestCoverage: number,
): LotComposition {
  return {
    category: toItemCategory(category),
    // The store's legacy D bucket is the engine's Salvage.
    gradeHistogram: { A: grades.A, B: grades.B, C: grades.C, Salvage: grades.D },
    avgClearingCents,
    manifestCoverageFrac: manifestCoverage,
  };
}

const BUYER_DIRECTORY: Record<LotBuyerType, { name: string; type: string; location: string }> = {
  refurbisher: { name: 'ReNew Electronics India', type: 'Verified Refurbisher', location: 'Bangalore' },
  wholesaler: { name: 'BulkMart Wholesale', type: 'Verified Wholesaler', location: 'Pune' },
  ngo: { name: 'Samarthan Foundation', type: 'NGO Donation Partner', location: 'Nagpur' },
  fashion_reseller: { name: 'SecondStyle Pvt Ltd', type: 'Fashion Reseller', location: 'Surat' },
};

// Deterministic alternates for re-matching (deal fell through → second-best bid).
const ALT_BUYER_DIRECTORY: Record<LotBuyerType, { name: string; type: string; location: string }> = {
  refurbisher: { name: 'GreenTech Refurb Co', type: 'Certified Refurbisher', location: 'Hyderabad' },
  wholesaler: { name: 'ValueChain India', type: 'B2B Reseller', location: 'Chennai' },
  ngo: { name: 'GreenHome NGO', type: 'NGO Donation Partner', location: 'Pune' },
  fashion_reseller: { name: 'EcoCircle Partners', type: 'Sustainability Reseller', location: 'Ahmedabad' },
};

function toBulkMatch(
  value: LotValue,
  lot: LotComposition,
  units: number,
  directory: Record<LotBuyerType, { name: string; type: string; location: string }>,
): BulkMatch {
  const buyer = directory[value.buyer];
  const verdict = shipNowOrWait(lot);
  const pickupDate = new Date(Date.now() + (verdict.shipNow ? 2 : 5) * 24 * 3600000);
  return {
    buyerName: buyer.name,
    buyerType: buyer.type,
    buyerLocation: buyer.location,
    matchedUnits: units,
    // NGO lots are zero-cash by design — the page detects donation via
    // sellerEarnings === 0; the CSR credit lives in the note, not the deal value.
    dealValue: Math.round(value.grossCents / 100),
    amazonCut: Math.round(value.amazonCutCents / 100),
    sellerEarnings: Math.round(value.sellerCents / 100),
    co2SavedKg: parseFloat((units * 0.042).toFixed(1)),
    pickupDate: pickupDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

export function generateMatch(
  units: number,
  category: string,
  preferred: string,
  grades?: { A: number; B: number; C: number; D: number },
): BulkMatch {
  const g = grades ?? generateGrades(units, category);
  const cat = toItemCategory(category);
  const lot = toLot(g, category, CLEARING_PER_UNIT_CENTS[cat], SUBMITTED_MANIFEST_COVERAGE);
  const value =
    preferred === 'Donation accepted'
      ? lotValueCents(lot, 'ngo')
      : preferred === 'Refurbisher only' && cat === 'electronics'
        ? lotValueCents(lot, 'refurbisher')
        : bestBuyer(lot);
  return toBulkMatch(value, lot, units, BUYER_DIRECTORY);
}

export function generateRematching(batch: BulkBatch): BulkMatch {
  const cat = toItemCategory(batch.category);
  const lot = toLot(
    batch.grades,
    batch.category,
    batch.avgClearingCents ?? CLEARING_PER_UNIT_CENTS[cat],
    batch.manifestCoverage ?? SUBMITTED_MANIFEST_COVERAGE,
  );
  // The first deal fell through: take the second-best bid, from the alternate
  // partner directory (a different counterparty, deterministically chosen).
  const value = secondBestBuyer(lot) ?? bestBuyer(lot);
  return toBulkMatch(value, lot, batch.units, ALT_BUYER_DIRECTORY);
}

// --- Spec 016.1: hub pallet staging ----------------------------------------------
// Returns whose engine decision is `liquidate` land here from the hub bench:
// one open lot per category fills unit by unit; the match and the ship-vs-wait
// verdict are recomputed by the engine on every unit added.

export function hubLotId(category: string): string {
  return `BLK-HUB-${toItemCategory(category)}`;
}

export function stageReturnIntoLot(
  ret: { returnId: string; category: string; priceCents: number },
  grade: Grade,
): BulkBatch {
  const cat = toItemCategory(ret.category);
  const id = hubLotId(ret.category);
  const existing = getBatches().find((b) => b.id === id && b.status === 'staging');
  const clearingCents = Math.round(ret.priceCents * 0.6); // clearing ≈ 60% of retail

  const prevUnits = existing?.units ?? 0;
  const prevAvg = existing?.avgClearingCents ?? 0;
  const grades = existing
    ? { ...existing.grades }
    : { A: 0, B: 0, C: 0, D: 0 };
  const bucket = grade === 'Salvage' ? 'D' : grade;
  grades[bucket] += 1;
  const units = prevUnits + 1;
  const avgClearingCents = Math.round((prevAvg * prevUnits + clearingCents) / units);

  const lot = toLot(grades, ret.category, avgClearingCents, HUB_MANIFEST_COVERAGE);
  const value = bestBuyer(lot);
  const verdict = shipNowOrWait(lot);

  const batch: BulkBatch = {
    id,
    category: ret.category,
    description: `Hub pallet — ${cat}, bench-verified, Health-Card manifested`,
    units,
    preferredOutcome: 'Let AI decide',
    submittedAt: existing?.submittedAt ?? new Date().toISOString(),
    grades,
    status: 'staging',
    primaryMatch: toBulkMatch(value, lot, units, BUYER_DIRECTORY),
    remainingUnits: 0,
    remainingNote: verdict.reason,
    avgClearingCents,
    manifestCoverage: HUB_MANIFEST_COVERAGE,
  };
  persistBatch(batch);
  return batch;
}
