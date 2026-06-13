export type BatchStatus =
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
  return `BLK-2025-${Math.floor(1000 + Math.random() * 9000)}`;
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

const BUYERS: Record<string, { name: string; type: string; location: string }> = {
  donation: { name: 'Samarthan Foundation', type: 'NGO Partner', location: 'Nagpur' },
  refurbisher: { name: 'ReNew Electronics India', type: 'Verified Refurbisher', location: 'Bangalore' },
  fashion: { name: 'SecondStyle Pvt Ltd', type: 'Fashion Reseller', location: 'Surat' },
  default: { name: 'BulkMart Wholesale', type: 'General Wholesaler', location: 'Pune' },
};

export function generateMatch(units: number, category: string, preferred: string): BulkMatch {
  const isElec = /electron|laptop|tablet|phone|gadget/i.test(category);
  const isFashion = /fashion|cloth|apparel|wear/i.test(category);
  const isDonation = preferred === 'Donation accepted';

  const buyer = isDonation
    ? BUYERS.donation
    : preferred === 'Refurbisher only' || isElec
    ? BUYERS.refurbisher
    : isFashion
    ? BUYERS.fashion
    : BUYERS.default;

  const pricePerUnit = isElec ? 1800 : isFashion ? 400 : 900;
  const dealValue = isDonation ? 0 : Math.round(units * pricePerUnit * (0.85 + Math.random() * 0.2));
  const amazonCut = isDonation ? 0 : Math.round(dealValue * 0.1);

  const pickupDate = new Date(Date.now() + 3 * 24 * 3600000);
  return {
    buyerName: buyer!.name,
    buyerType: buyer!.type,
    buyerLocation: buyer!.location,
    matchedUnits: units,
    dealValue,
    amazonCut,
    sellerEarnings: dealValue - amazonCut,
    co2SavedKg: parseFloat((units * 0.042 + Math.random() * 1.5).toFixed(1)),
    pickupDate: pickupDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

export function generateRematching(batch: BulkBatch): BulkMatch {
  const altBuyers = [
    { name: 'GreenTech Refurb Co', type: 'Certified Refurbisher', location: 'Hyderabad' },
    { name: 'ValueChain India', type: 'B2B Reseller', location: 'Chennai' },
    { name: 'EcoCircle Partners', type: 'Sustainability Reseller', location: 'Ahmedabad' },
  ];
  const buyer = altBuyers[Math.floor(Math.random() * altBuyers.length)];
  const units = batch.units;
  const pricePerUnit = /electron/i.test(batch.category) ? 1650 : 850;
  const dealValue = Math.round(units * pricePerUnit * (0.88 + Math.random() * 0.15));
  const amazonCut = Math.round(dealValue * 0.1);

  const pickupDate = new Date(Date.now() + 4 * 24 * 3600000);
  return {
    buyerName: buyer!.name,
    buyerType: buyer!.type,
    buyerLocation: buyer!.location,
    matchedUnits: units,
    dealValue,
    amazonCut,
    sellerEarnings: dealValue - amazonCut,
    co2SavedKg: parseFloat((units * 0.038 + Math.random() * 1.2).toFixed(1)),
    pickupDate: pickupDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}
