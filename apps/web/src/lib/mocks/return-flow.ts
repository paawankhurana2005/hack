import type {
  GradingScenario,
  HandoffScenario,
  ItemCategory,
  MockOrder,
  PathEv,
  ReturnGradingResult,
  ReturnHandoffDetails,
  ReturnReason,
  ReturnRoutingDecision,
  RoutingScenario,
} from '@reloop/shared';
import { computeReturnVoucherCredits } from '@reloop/shared';

export const mockOrders: MockOrder[] = [
  // Orders mapped to users' return-eligible owned items (My Items → Return).
  {
    orderId: 'ORD-2001',
    productName: 'Apple AirPods',
    imageUrl: '/catalog/airpods-pro.jpg',
    orderDate: '2026-06-02T00:00:00Z',
    priceCents: 1490000,
    currency: 'INR',
    sku: 'B0AIRPODS02',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2002',
    productName: 'Apple iPad Mini',
    imageUrl: '/catalog/ipad-air.jpg',
    orderDate: '2026-05-30T00:00:00Z',
    priceCents: 4990000,
    currency: 'INR',
    sku: 'B0IPADMINI6',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2003',
    productName: 'Oppo A57',
    imageUrl: '/catalog/galaxy-phone.jpg',
    orderDate: '2026-06-04T00:00:00Z',
    priceCents: 1890000,
    currency: 'INR',
    sku: 'B0OPPOA5701',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2004',
    productName: 'Wireless Earbuds',
    imageUrl: '/catalog/earphones.jpg',
    orderDate: '2026-06-01T00:00:00Z',
    priceCents: 599900,
    currency: 'INR',
    sku: 'B0EARBUDS04',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2005',
    productName: 'Apple iPhone 15 Pro Max',
    imageUrl: '/catalog/iphone-15-pro.png',
    orderDate: '2026-07-02T00:00:00Z',
    priceCents: 15990000,
    currency: 'INR',
    sku: 'B09IPHONE15',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2006',
    productName: 'Apple AirPods Pro (2nd Gen)',
    imageUrl: '/catalog/airpods-pro.jpg',
    orderDate: '2026-07-03T00:00:00Z',
    priceCents: 2490000,
    currency: 'INR',
    sku: 'B09AIRPODS2',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2007',
    productName: 'Sony PlayStation 5 Console',
    imageUrl: '/catalog/ps5-console.png',
    orderDate: '2026-07-01T00:00:00Z',
    priceCents: 5499000,
    currency: 'INR',
    sku: 'B09PS5CON07',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2008',
    productName: 'Samsung Galaxy S23 Ultra',
    imageUrl: '/catalog/galaxy-s23.png',
    orderDate: '2026-07-04T00:00:00Z',
    priceCents: 12499900,
    currency: 'INR',
    sku: 'B09GALAXY23',
    category: 'electronics',
  },
  // Official brand assets (downloaded from the products' own websites).
  {
    orderId: 'ORD-2009',
    productName: "Nike Air Force 1 '07",
    imageUrl: '/catalog/official-nike-af1.jpg',
    orderDate: '2026-07-03T00:00:00Z',
    priceCents: 969500,
    currency: 'INR',
    sku: 'B08NIKEAF107',
    category: 'footwear',
  },
  {
    orderId: 'ORD-2010',
    productName: 'Nike Sportswear Club Fleece Hoodie',
    imageUrl: '/catalog/official-nike-hoodie.jpg',
    orderDate: '2026-07-04T00:00:00Z',
    priceCents: 549500,
    currency: 'INR',
    sku: 'B08NIKEHOOD10',
    category: 'apparel',
  },
  {
    orderId: 'ORD-2011',
    productName: 'Nike Dunk Low Retro',
    imageUrl: '/catalog/official-nike-dunk.jpg',
    orderDate: '2026-07-02T00:00:00Z',
    priceCents: 929500,
    currency: 'INR',
    sku: 'B08NIKEDUNK11',
    category: 'footwear',
  },
  {
    orderId: 'ORD-2012',
    productName: 'Nike Sportswear Club T-Shirt',
    imageUrl: '/catalog/official-nike-tee.jpg',
    orderDate: '2026-07-05T00:00:00Z',
    priceCents: 219500,
    currency: 'INR',
    sku: 'B08NIKETEE12',
    category: 'apparel',
  },
  {
    orderId: 'ORD-2013',
    productName: 'Stanley Quencher H2.0 Tumbler 40oz',
    imageUrl: '/catalog/official-stanley-quencher.png',
    orderDate: '2026-07-05T00:00:00Z',
    priceCents: 399900,
    currency: 'INR',
    sku: 'B07STANLEY13',
    category: 'home',
  },
  // --- New users' returns (Kabir / Diya / Ishaan / Priya) ------------------
  {
    orderId: 'ORD-2014',
    productName: 'Nike Air Max 90',
    imageUrl: '/catalog/official-nike-airmax90.jpg',
    orderDate: '2026-07-04T00:00:00Z',
    priceCents: 1099500,
    currency: 'INR',
    sku: 'B08NIKEAM90',
    category: 'footwear',
  },
  {
    orderId: 'ORD-2015',
    productName: 'Apple AirPods Pro (2nd Gen)',
    imageUrl: '/catalog/airpods-pro.jpg',
    orderDate: '2026-07-05T00:00:00Z',
    priceCents: 2490000,
    currency: 'INR',
    sku: 'B09AIRPODS15',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2016',
    productName: 'Nike Dunk Low Retro',
    imageUrl: '/catalog/official-nike-dunk.jpg',
    orderDate: '2026-07-03T00:00:00Z',
    priceCents: 929500,
    currency: 'INR',
    sku: 'B08NIKEDUNK16',
    category: 'footwear',
  },
  {
    orderId: 'ORD-2017',
    productName: 'Stanley Quencher H2.0 Tumbler 40oz',
    imageUrl: '/catalog/official-stanley-quencher.png',
    orderDate: '2026-07-04T00:00:00Z',
    priceCents: 399900,
    currency: 'INR',
    sku: 'B07STANLEY17',
    category: 'home',
  },
  {
    orderId: 'ORD-2018',
    productName: "Nike Air Force 1 '07",
    imageUrl: '/catalog/official-nike-af1.jpg',
    orderDate: '2026-07-02T00:00:00Z',
    priceCents: 969500,
    currency: 'INR',
    sku: 'B08NIKEAF118',
    category: 'footwear',
  },
  {
    orderId: 'ORD-2019',
    productName: 'Sony PlayStation 5 Console',
    imageUrl: '/catalog/ps5-console.png',
    orderDate: '2026-07-03T00:00:00Z',
    priceCents: 5499000,
    currency: 'INR',
    sku: 'B09PS5CON19',
    category: 'electronics',
  },
  {
    orderId: 'ORD-2020',
    productName: 'Nike Sportswear Club Fleece Hoodie',
    imageUrl: '/catalog/official-nike-hoodie.jpg',
    orderDate: '2026-07-05T00:00:00Z',
    priceCents: 549500,
    currency: 'INR',
    sku: 'B08NIKEHOOD20',
    category: 'apparel',
  },
  {
    orderId: 'ORD-2021',
    productName: 'Samsung Galaxy S23 Ultra',
    imageUrl: '/catalog/galaxy-s23.png',
    orderDate: '2026-07-04T00:00:00Z',
    priceCents: 12499900,
    currency: 'INR',
    sku: 'B09GALAXY21',
    category: 'electronics',
  },
  {
    orderId: 'ORD-1001',
    productName: 'Sony WH-1000XM5 Wireless Headphones',
    imageUrl: '/catalog/sony-wh1000xm.jpg',
    orderDate: '2026-05-28T00:00:00Z',
    priceCents: 249900,
    currency: 'INR',
    sku: 'B09XS7JWHH',
    category: 'electronics',
  },
  {
    orderId: 'ORD-1002',
    productName: "Men's Slim Fit Oxford Shirt",
    imageUrl: '',
    orderDate: '2026-06-01T00:00:00Z',
    priceCents: 129900,
    currency: 'INR',
    sku: 'B08ZYXKLMN',
    category: 'apparel',
  },
  {
    orderId: 'ORD-1003',
    productName: 'Prestige 5L Pressure Cooker',
    imageUrl: '/catalog/pressure-cooker.jpg',
    orderDate: '2026-06-05T00:00:00Z',
    priceCents: 89900,
    currency: 'INR',
    sku: 'B07PQRSTUV',
    category: 'kitchenware',
  },
];

const GRADING_SCENARIOS: Record<GradingScenario, Omit<ReturnGradingResult, 'rawReason'>> = {
  high_confidence: {
    grade: 'A',
    confidence: 0.92,
    defects: ['Minor scratch on back panel'],
    authenticityMatch: true,
    wardrobingFlag: false,
    functionallyVerifiable: true,
    packagingSealed: true, // spec 016: seal verified from photos → restock-eligible
  },
  low_confidence: {
    grade: 'B',
    confidence: 0.45,
    defects: ['Unable to assess — image quality too low'],
    authenticityMatch: true,
    wardrobingFlag: false,
    functionallyVerifiable: true,
  },
  auth_mismatch: {
    grade: 'C',
    confidence: 0.78,
    defects: ['Significant wear on corners', 'Label inconsistency detected'],
    authenticityMatch: false,
    wardrobingFlag: false,
    functionallyVerifiable: true,
  },
  wardrobing: {
    grade: 'C',
    confidence: 0.81,
    defects: ['Evidence of extended use', 'Tags removed and reattached'],
    authenticityMatch: true,
    wardrobingFlag: true,
    functionallyVerifiable: true,
  },
  unverifiable: {
    grade: 'B',
    confidence: 0.80,
    defects: ['Cannot verify functional state from photos alone'],
    authenticityMatch: true,
    wardrobingFlag: false,
    functionallyVerifiable: false,
  },
};

const ROUTING_SCENARIOS: Record<RoutingScenario, ReturnRoutingDecision> = {
  restock: {
    decision: 'restock',
    reasoning:
      'Factory seal verified from photos and the reason is a change of mind — this item goes straight back to sellable inventory at the fulfilment centre 45km away, skipping the 580km returns-centre trip and weeks of dwell entirely.',
    co2SavedKg: 2.1,
    dwellBudgetHours: 0,
    ttlHours: 24,
    sellerType: '1P',
    fallbackChain: ['local_resale', 'donate'],
    warehouseDistanceKm: 580,
    warehouseMargin: -480,
    localMargin: 4820,
  },
  local_resale: {
    decision: 'local_resale',
    reasoning:
      'Amazon found 8 verified buyers within 4km who want this item. Local handling cost ₹380 vs ₹1,240 for a 580km warehouse round-trip — net saving ₹860 for the seller. Item stays local; your refund is unaffected.',
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
  refurbish: {
    decision: 'refurbish',
    reasoning:
      'Minor cosmetic wear detected. A certified refurbishment partner 3km away can restore resale value from ₹800 to ₹1,800 — net margin ₹1,400 vs a projected loss of ₹440 via warehouse return. Item will not travel 580km.',
    co2SavedKg: 1.2,
    dwellBudgetHours: 72,
    sellerType: '1P',
    fallbackChain: ['donate', 'recycle'],
    warehouseDistanceKm: 580,
    warehouseMargin: -440,
    localMargin: 1400,
  },
  liquidate: {
    decision: 'liquidate',
    reasoning:
      'Functional but local demand is thin — staged into a graded pallet at the hub. Every unit carries its Health Card: manifested pallets clear at 25–30¢ on the retail dollar vs 5–20¢ for mystery lots, and skip the 580km linehaul.',
    co2SavedKg: 2.2,
    dwellBudgetHours: 96,
    ttlHours: 48,
    sellerType: '1P',
    fallbackChain: ['donate', 'recycle'],
    warehouseDistanceKm: 580,
    warehouseMargin: -310,
    localMargin: 540,
  },
  donate: {
    decision: 'donate',
    reasoning:
      'Local resale margin after handling cost is ₹120 — below the ₹300 viability threshold. 2 verified NGO partners within 5km accept this category. Donating locally avoids 580km of freight and maximises social impact.',
    co2SavedKg: 0.8,
    dwellBudgetHours: 48,
    sellerType: '1P',
    fallbackChain: ['recycle'],
    warehouseDistanceKm: 580,
  },
  recycle: {
    decision: 'recycle',
    reasoning:
      'Item assessed as Salvage grade — not suitable for resale, refurbishment, or donation. Routing to a certified e-waste recycler 8km away instead of the warehouse. Zero-landfill guaranteed.',
    co2SavedKg: 0.3,
    dwellBudgetHours: 0,
    sellerType: '1P',
    fallbackChain: [],
  },
  warehouse: {
    decision: 'warehouse',
    reasoning:
      'No local demand signal found within 6km radius and no eligible local partners. Routing to the nearest fulfilment centre for standard disposition.',
    co2SavedKg: 0,
    dwellBudgetHours: 0,
    sellerType: '1P',
    fallbackChain: [],
  },
  return_to_seller: {
    decision: 'return_to_seller',
    reasoning:
      'This 3P seller has not opted into ReLoop local routing. Item is returned to the seller per their stated return policy. Your refund is unaffected.',
    co2SavedKg: 0,
    dwellBudgetHours: 0,
    sellerType: '3P',
    fallbackChain: [],
  },
  returnless_refund: {
    decision: 'returnless_refund',
    reasoning:
      'Every route loses money for this item — processing runs ~₹27 per ₹100 of order value, more than any recovery path returns. Refund issued; keep the item. Zero trips, zero packaging, zero carbon.',
    co2SavedKg: 2.5,
    dwellBudgetHours: 0,
    ttlHours: 72,
    sellerType: '1P',
    fallbackChain: [],
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return delay(min + Math.random() * (max - min));
}

export async function mockGradeItem(
  reason: ReturnReason,
  _photos: string[],
  scenario: GradingScenario = 'high_confidence',
): Promise<ReturnGradingResult> {
  await randomDelay(1500, 2500);
  return { ...GRADING_SCENARIOS[scenario], rawReason: reason };
}

// Same SKU-prefix mock the API's routing engine keys off (apps/api/src/lib/routing-engine.ts),
// mirrored here so the client-side demo scenarios can feed the real carbon-voucher
// formula (spec 015) instead of inventing a second mapping.
function categoryForSku(sku: string): ItemCategory {
  const prefix = sku.slice(0, 3);
  if (prefix === 'B09') return 'electronics';
  if (prefix === 'B08') return 'fashion';
  if (prefix === 'B07') return 'home';
  return 'other';
}

export async function mockRouteItem(
  _gradingResult: ReturnGradingResult | null,
  reason: ReturnReason,
  sku: string,
  scenario: RoutingScenario = 'local_resale',
): Promise<ReturnRoutingDecision> {
  await randomDelay(2000, 2000);
  // wrong_item: item isn't the customer's — must return to origin, can't route locally.
  // arrived_damaged: shipping caused the damage; bridge still evaluates local paths
  // (refurbish, donate, as-is sale) rather than defaulting to recycle.
  if (reason === 'wrong_item') return { ...ROUTING_SCENARIOS.warehouse };

  const decision = { ...ROUTING_SCENARIOS[scenario] };

  // Spec 015, 1P only: fund the voucher from the real captured EV delta vs.
  // warehouse. Only local_resale/refurbish carry margin data in this scenario
  // table — donate/recycle/warehouse scenarios have no dollar counterfactual to
  // cap a voucher against here, so they stay undefined rather than a guessed number.
  if (
    decision.sellerType === '1P' &&
    decision.localMargin !== undefined &&
    decision.warehouseMargin !== undefined
  ) {
    const paths: PathEv[] = [
      { path: decision.decision, evCents: Math.round(decision.localMargin * 100), viable: true, terms: [] },
      { path: 'warehouse', evCents: Math.round(decision.warehouseMargin * 100), viable: true, terms: [] },
    ];
    const voucher = computeReturnVoucherCredits(categoryForSku(sku), decision.decision, decision.co2SavedKg, paths);
    if (voucher) {
      decision.voucherEcoCredits = voucher.ecoCredits;
      decision.voucherFactors = voucher.factors;
    }
  }

  return decision;
}

export function mockHandoff(
  decision: ReturnRoutingDecision['decision'],
  scenario: HandoffScenario = 'locker',
): ReturnHandoffDetails | null {
  if (decision === 'warehouse') return null;
  // Returnless: the item never moves — there is no handoff at all.
  if (decision === 'returnless_refund') return null;

  const base = {
    qrCode: `QR-RET-${Date.now()}`,
    confirmationId: `RET-2026-${Math.floor(100000 + Math.random() * 900000)}`,
  };

  if (scenario === 'no_locker') {
    return {
      ...base,
      method: 'agent_pickup',
      locationName: 'Doorstep Pickup',
      locationAddress: 'Your registered address',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      note: 'No lockers available nearby — an agent will collect from you.',
    };
  }

  if (scenario === 'locker_full') {
    return {
      ...base,
      method: 'hub_dropoff',
      locationName: 'Amazon Returns Hub — Koramangala',
      locationAddress: '80 Feet Road, 4th Block, Koramangala, Bengaluru 560034',
      note: 'Nearest locker is full — drop off at this hub instead.',
    };
  }

  if (scenario === 'agent_pickup') {
    return {
      ...base,
      method: 'agent_pickup',
      locationName: 'Doorstep Pickup',
      locationAddress: 'Your registered address',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    };
  }

  if (scenario === 'hub_dropoff') {
    return {
      ...base,
      method: 'hub_dropoff',
      locationName: 'Amazon Returns Hub — Koramangala',
      locationAddress: '80 Feet Road, 4th Block, Koramangala, Bengaluru 560034',
    };
  }

  // default: locker
  return {
    ...base,
    method: 'locker',
    locationName: 'Amazon Locker — Indiranagar',
    locationAddress: '100 Feet Road, Indiranagar, Bengaluru 560038',
  };
}
