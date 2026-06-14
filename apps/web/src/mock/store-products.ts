// "Buy new" storefront catalog (demo, mock). This is the surface that hosts the
// Return-Prevention pillar: a near-Amazon product page where the AI predicts how
// likely a chosen VARIANT (e.g. a shoe size) is to come back — before purchase.
//
// Only the hero running shoe carries per-size predictions; the rest fill the grid
// so the storefront reads like a real catalog. Reuses existing /catalog images —
// no new assets.

import type { ItemCategory, Money, ReturnRiskPrediction } from '@reloop/shared';

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

export interface StoreProduct {
  id: string;
  title: string;
  brand: string;
  category: ItemCategory;
  imageUrl: string;
  price: Money;
  originalPrice?: Money;
  /** 0..5 average star rating. */
  rating: number;
  ratingCount: number;
  description: string;
  /** Variant labels (e.g. shoe sizes). Absent → product has no variant selector. */
  sizes?: string[];
  /** Per-variant return-risk predictions, keyed by the size label. */
  predictions?: Record<string, ReturnRiskPrediction>;
}

// --- Hero: the predictive running shoe -------------------------------------
// Size 8 is the "runs small" hot spot; size 9 is the safe re-buy.
const PEGASUS_PREDICTIONS: Record<string, ReturnRiskPrediction> = {
  '7': {
    variantLabel: 'Size 7',
    riskLevel: 'moderate',
    returnRate: 0.14,
    confidence: 0.82,
    reasons: [
      { reason: 'Runs small', share: 0.52 },
      { reason: 'Wrong fit', share: 0.3 },
      { reason: 'Changed mind', share: 0.18 },
    ],
    recommendation: {
      variantLabel: 'Size 8',
      returnRate: 0.38,
      rationale: 'Sizing up one is common here, but size 8 itself runs high — size 9 is the safest fit.',
    },
  },
  '8': {
    variantLabel: 'Size 8',
    riskLevel: 'high',
    returnRate: 0.38,
    confidence: 0.91,
    reasons: [
      { reason: 'Runs small', share: 0.61 },
      { reason: 'Wrong fit', share: 0.24 },
      { reason: 'Changed mind', share: 0.15 },
    ],
    recommendation: {
      variantLabel: 'Size 9',
      returnRate: 0.06,
      rationale: '72% of shoppers who returned size 8 re-bought size 9 and kept it.',
    },
  },
  '9': {
    variantLabel: 'Size 9',
    riskLevel: 'low',
    returnRate: 0.06,
    confidence: 0.9,
    reasons: [
      { reason: 'Changed mind', share: 0.58 },
      { reason: 'Wrong fit', share: 0.42 },
    ],
  },
  '10': {
    variantLabel: 'Size 10',
    riskLevel: 'low',
    returnRate: 0.08,
    confidence: 0.87,
    reasons: [
      { reason: 'Changed mind', share: 0.55 },
      { reason: 'Wrong fit', share: 0.45 },
    ],
  },
  '11': {
    variantLabel: 'Size 11',
    riskLevel: 'moderate',
    returnRate: 0.13,
    confidence: 0.79,
    reasons: [
      { reason: 'Runs large', share: 0.5 },
      { reason: 'Wrong fit', share: 0.31 },
      { reason: 'Changed mind', share: 0.19 },
    ],
    recommendation: {
      variantLabel: 'Size 10',
      returnRate: 0.08,
      rationale: 'This size trends large — most shoppers who returned it kept size 10.',
    },
  },
};

export const HERO_PRODUCT_ID = 'store_pegasus';

const PRODUCTS: StoreProduct[] = [
  {
    id: HERO_PRODUCT_ID,
    title: 'Nike Air Zoom Pegasus 40',
    brand: 'Nike',
    category: 'sports',
    imageUrl: '/catalog/pegasus.jpg',
    price: inr(899900), // ₹8,999
    originalPrice: inr(1099500), // ₹10,995
    rating: 4.3,
    ratingCount: 2148,
    description:
      'Responsive everyday running shoe with Zoom Air cushioning and a breathable engineered mesh upper. A reliable daily trainer for road miles.',
    sizes: ['7', '8', '9', '10', '11'],
    predictions: PEGASUS_PREDICTIONS,
  },
  {
    id: 'store_echo',
    title: 'Amazon Echo Dot (5th Gen)',
    brand: 'Amazon',
    category: 'electronics',
    imageUrl: '/catalog/jbl-speaker.jpg',
    price: inr(549900), // ₹5,499
    rating: 4.6,
    ratingCount: 9421,
    description:
      'Smart speaker with Alexa. Crisp vocals and balanced bass for its size — control your smart home with your voice.',
  },
  {
    id: 'store_camera',
    title: 'Canon EOS R50 Mirrorless Camera',
    brand: 'Canon',
    category: 'electronics',
    imageUrl: '/catalog/canon-camera.jpg',
    price: inr(6499900), // ₹64,999
    rating: 4.7,
    ratingCount: 612,
    description:
      '24.2MP mirrorless camera with 4K video and fast subject-tracking autofocus. A compact step-up for creators.',
  },
];

export const storeProducts: StoreProduct[] = PRODUCTS;

export function findStoreProduct(id: string): StoreProduct | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
