// "Buy new" storefront catalog (demo, mock). This is the surface that hosts the
// Return-Prevention pillar: a near-Amazon product page where the AI predicts how
// likely a chosen VARIANT (e.g. a shoe size) is to come back — before purchase.
//
// Products are grouped (Phones, Audio, Gaming, …) for the category filter, and
// every image is a real, exact-model product shot under /catalog. Only the hero
// running/court shoe carries per-size predictions; the rest fill the grid so the
// storefront reads like a real catalog.

import type { ItemCategory, Money, ReturnRiskPrediction } from '@reloop/shared';

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

export interface StoreProduct {
  id: string;
  title: string;
  brand: string;
  category: ItemCategory;
  /** Display group for the category filter (e.g. "Phones", "Gaming"). */
  group: string;
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

/** Category chip order for the storefront filter. */
export const storeGroups = [
  'Phones',
  'Laptops & Tablets',
  'Audio',
  'Gaming',
  'Cameras',
  'Wearables',
  'Home',
  'Footwear',
] as const;

// --- Hero: the predictive court shoe ---------------------------------------
// Size 8 is the "runs small" hot spot; size 9 is the safe re-buy.
const J1_PREDICTIONS: Record<string, ReturnRiskPrediction> = {
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
  // --- Footwear (prevention hero) ------------------------------------------
  {
    id: HERO_PRODUCT_ID,
    title: 'Nike Air Jordan 1 Mid',
    brand: 'Nike',
    category: 'fashion',
    group: 'Footwear',
    imageUrl: '/catalog/pegasus.jpg',
    price: inr(1029500), // ₹10,295
    originalPrice: inr(1229500), // ₹12,295
    rating: 4.5,
    ratingCount: 3142,
    description:
      'Iconic mid-top in the Chicago colorway. Premium leather upper, Air-Sole cushioning and a timeless silhouette that goes with everything.',
    sizes: ['7', '8', '9', '10', '11'],
    predictions: J1_PREDICTIONS,
  },

  // --- Phones --------------------------------------------------------------
  {
    id: 'store_iphone15pro',
    title: 'Apple iPhone 15 Pro Max',
    brand: 'Apple',
    category: 'electronics',
    group: 'Phones',
    imageUrl: '/catalog/iphone-15-pro.png',
    price: inr(15990000), // ₹1,59,900
    rating: 4.8,
    ratingCount: 8421,
    description:
      'Titanium design, A17 Pro chip and a 5x telephoto camera. The most capable iPhone yet, built for pro photography and gaming.',
  },
  {
    id: 'store_galaxys23',
    title: 'Samsung Galaxy S23 Ultra',
    brand: 'Samsung',
    category: 'electronics',
    group: 'Phones',
    imageUrl: '/catalog/galaxy-s23.png',
    price: inr(12499900), // ₹1,24,999
    originalPrice: inr(13499900),
    rating: 4.7,
    ratingCount: 6233,
    description:
      '200MP camera, built-in S Pen and a 6.8" Dynamic AMOLED display. A flagship for power users who want it all.',
  },
  {
    id: 'store_pixel8pro',
    title: 'Google Pixel 8 Pro',
    brand: 'Google',
    category: 'electronics',
    group: 'Phones',
    imageUrl: '/catalog/pixel-8-pro.jpg',
    price: inr(10699900), // ₹1,06,999
    rating: 4.6,
    ratingCount: 2987,
    description:
      'Tensor G3 chip with the smartest Pixel camera ever. Magic Editor, seven years of updates and a bright Super Actua display.',
  },

  // --- Laptops & Tablets ---------------------------------------------------
  {
    id: 'store_macbookair',
    title: 'Apple MacBook Air (M2)',
    brand: 'Apple',
    category: 'electronics',
    group: 'Laptops & Tablets',
    imageUrl: '/catalog/macbook-air.jpg',
    price: inr(11490000), // ₹1,14,900
    rating: 4.8,
    ratingCount: 5120,
    description:
      'Strikingly thin, silent and fast. The M2 chip delivers all-day battery life and a gorgeous Liquid Retina display.',
  },
  {
    id: 'store_ipadair',
    title: 'Apple iPad Air',
    brand: 'Apple',
    category: 'electronics',
    group: 'Laptops & Tablets',
    imageUrl: '/catalog/ipad-air.jpg',
    price: inr(5990000), // ₹59,900
    rating: 4.7,
    ratingCount: 4310,
    description:
      'Powerful, colorful and versatile. M-series performance with Apple Pencil support — perfect for sketching, notes and streaming.',
  },
  {
    id: 'store_kindle',
    title: 'Amazon Kindle Paperwhite',
    brand: 'Amazon',
    category: 'electronics',
    group: 'Laptops & Tablets',
    imageUrl: '/catalog/kindle-paperwhite.jpg',
    price: inr(1699900), // ₹16,999
    rating: 4.6,
    ratingCount: 11204,
    description:
      'A 6.8" glare-free display, warm adjustable light and weeks of battery. Holds thousands of books and reads like paper.',
  },

  // --- Audio ---------------------------------------------------------------
  {
    id: 'store_airpodspro',
    title: 'Apple AirPods Pro (2nd Gen)',
    brand: 'Apple',
    category: 'electronics',
    group: 'Audio',
    imageUrl: '/catalog/airpods-pro.jpg',
    price: inr(2490000), // ₹24,900
    rating: 4.7,
    ratingCount: 9870,
    description:
      'Up to 2x more active noise cancellation, adaptive transparency and richer bass. Personalised spatial audio in a tiny package.',
  },
  {
    id: 'store_sonyxm5',
    title: 'Sony WH-1000XM5 Headphones',
    brand: 'Sony',
    category: 'electronics',
    group: 'Audio',
    imageUrl: '/catalog/sony-wh1000xm.jpg',
    price: inr(2999000), // ₹29,990
    originalPrice: inr(3499000),
    rating: 4.8,
    ratingCount: 6541,
    description:
      'Industry-leading noise cancellation, 30-hour battery and crystal-clear hands-free calls. The benchmark for travel headphones.',
  },
  {
    id: 'store_boseqc',
    title: 'Bose QuietComfort Headphones',
    brand: 'Bose',
    category: 'electronics',
    group: 'Audio',
    imageUrl: '/catalog/bose-qc.jpg',
    price: inr(2690000), // ₹26,900
    rating: 4.6,
    ratingCount: 4198,
    description:
      'Legendary Bose noise cancellation with plush, all-day comfort. Adjustable modes and a foldable, travel-ready design.',
  },
  {
    id: 'store_jblcharge',
    title: 'JBL Charge 5 Bluetooth Speaker',
    brand: 'JBL',
    category: 'electronics',
    group: 'Audio',
    imageUrl: '/catalog/jbl-charge.jpg',
    price: inr(1499900), // ₹14,999
    rating: 4.5,
    ratingCount: 7782,
    description:
      'Bold JBL Pro sound, 20 hours of playtime and an IP67 waterproof build. Doubles as a power bank for your phone.',
  },

  // --- Gaming --------------------------------------------------------------
  {
    id: 'store_ps5',
    title: 'Sony PlayStation 5 Console',
    brand: 'Sony',
    category: 'electronics',
    group: 'Gaming',
    imageUrl: '/catalog/ps5-console.png',
    price: inr(5499000), // ₹54,990
    rating: 4.8,
    ratingCount: 15320,
    description:
      'Lightning-fast SSD loading, 4K gaming and the haptic DualSense controller. Next-gen play with a vast game library.',
  },
  {
    id: 'store_xboxx',
    title: 'Xbox Series X Console',
    brand: 'Microsoft',
    category: 'electronics',
    group: 'Gaming',
    imageUrl: '/catalog/xbox-series-x.jpg',
    price: inr(5299000), // ₹52,990
    rating: 4.7,
    ratingCount: 9043,
    description:
      'The most powerful Xbox ever — 12 teraflops, true 4K at up to 120fps and Quick Resume across multiple games.',
  },
  {
    id: 'store_switcholed',
    title: 'Nintendo Switch OLED',
    brand: 'Nintendo',
    category: 'electronics',
    group: 'Gaming',
    imageUrl: '/catalog/switch-oled.jpg',
    price: inr(3499900), // ₹34,999
    rating: 4.8,
    ratingCount: 12877,
    description:
      'A vivid 7" OLED screen, enhanced audio and a wide adjustable stand. Play at home or on the go in handheld mode.',
  },

  // --- Cameras -------------------------------------------------------------
  {
    id: 'store_canonr5',
    title: 'Canon EOS R5 Mirrorless Camera',
    brand: 'Canon',
    category: 'electronics',
    group: 'Cameras',
    imageUrl: '/catalog/canon-r5.jpg',
    price: inr(32999500), // ₹3,29,995
    rating: 4.9,
    ratingCount: 842,
    description:
      '45MP full-frame sensor, 8K RAW video and blazing dual-pixel autofocus. A professional hybrid for stills and cinema.',
  },
  {
    id: 'store_gopro',
    title: 'GoPro HERO12 Black',
    brand: 'GoPro',
    category: 'electronics',
    group: 'Cameras',
    imageUrl: '/catalog/gopro-hero.jpg',
    price: inr(4500000), // ₹45,000
    rating: 4.6,
    ratingCount: 3611,
    description:
      'Rugged, waterproof action cam with 5.3K video and HyperSmooth stabilisation. Built for adventures, mounts anywhere.',
  },
  {
    id: 'store_dji',
    title: 'DJI Mavic 3 Pro Drone',
    brand: 'DJI',
    category: 'electronics',
    group: 'Cameras',
    imageUrl: '/catalog/dji-mavic.jpg',
    price: inr(12990000), // ₹1,29,900
    rating: 4.8,
    ratingCount: 1290,
    description:
      'A flagship triple-camera drone with a Hasselblad sensor, 43 minutes of flight time and pro-grade obstacle sensing.',
  },

  // --- Wearables -----------------------------------------------------------
  {
    id: 'store_applewatch',
    title: 'Apple Watch Series 9',
    brand: 'Apple',
    category: 'electronics',
    group: 'Wearables',
    imageUrl: '/catalog/apple-watch-series.jpg',
    price: inr(4190000), // ₹41,900
    rating: 4.7,
    ratingCount: 7560,
    description:
      'The brightest display yet, the new double-tap gesture and advanced health sensors. Your essential everyday companion.',
  },

  // --- Home ----------------------------------------------------------------
  {
    id: 'store_samsungtv',
    title: 'Samsung 55" Crystal 4K Smart TV',
    brand: 'Samsung',
    category: 'home',
    group: 'Home',
    imageUrl: '/catalog/samsung-tv-led.jpg',
    price: inr(5499000), // ₹54,990
    originalPrice: inr(6999000),
    rating: 4.5,
    ratingCount: 5421,
    description:
      'Crystal Processor 4K, vibrant HDR and built-in smart apps. A big, bright screen for movie nights and the big match.',
  },
  {
    id: 'store_dyson',
    title: 'Dyson V10 Cordless Vacuum',
    brand: 'Dyson',
    category: 'home',
    group: 'Home',
    imageUrl: '/catalog/dyson-v10.jpg',
    price: inr(3990000), // ₹39,900
    rating: 4.6,
    ratingCount: 4087,
    description:
      'Powerful cordless suction, up to 60 minutes of run time and whole-machine filtration. Converts to a handheld in a click.',
  },
  {
    id: 'store_nespresso',
    title: 'Nespresso Vertuo Coffee Machine',
    brand: 'Nespresso',
    category: 'home',
    group: 'Home',
    imageUrl: '/catalog/nespresso.jpg',
    price: inr(1490000), // ₹14,900
    rating: 4.5,
    ratingCount: 6914,
    description:
      'Barista-style coffee and espresso at one touch, with Centrifusion brewing and a rich crema in every cup.',
  },
  {
    id: 'store_cooker',
    title: 'Electric Pressure Cooker (6L)',
    brand: 'Marta',
    category: 'home',
    group: 'Home',
    imageUrl: '/catalog/pressure-cooker.jpg',
    price: inr(899900), // ₹8,999
    rating: 4.4,
    ratingCount: 3320,
    description:
      'A 6-litre multi-cooker that pressure-cooks, steams and slow-cooks. Programmable presets make weeknight dinners effortless.',
  },
];

export const storeProducts: StoreProduct[] = PRODUCTS;

export function findStoreProduct(id: string): StoreProduct | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
