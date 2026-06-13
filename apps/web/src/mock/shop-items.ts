import {
  estimateImpact,
  type ConditionGrade,
  type ItemCategory,
  type Money,
  type ProductHealthCard,
  type ShopItem,
} from '@reloop/shared';

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

// The hero listing (Aarav's) — appears in the Shop AND in My Listings. Buying it
// flips it to Sold in My Listings via the shared marketplace store.
export const HERO_ID = 'shop_pegasus';

interface Spec {
  id: string;
  title: string;
  category: ItemCategory;
  imageUrl: string;
  sellerName: string;
  grade: ConditionGrade;
  confidence: number;
  summary: string;
  issues: string[];
  verified: boolean;
  originalPaise: number;
  listingPaise: number;
  listedAt: string; // ISO date the card was issued
}

function buildCard(s: Spec): ProductHealthCard {
  const history: ProductHealthCard['history'] = [
    { label: 'Graded', at: `${s.listedAt}T09:00:00.000Z` },
    { label: 'Priced', at: `${s.listedAt}T09:00:30.000Z` },
    ...(s.verified ? [{ label: 'Verified authentic', at: `${s.listedAt}T09:00:45.000Z` }] : []),
    { label: 'Health Card issued', at: `${s.listedAt}T09:01:00.000Z` },
  ];
  return {
    id: `RLP-${s.id.slice(-4).toUpperCase()}`,
    productId: `prod_${s.id}`,
    title: s.title,
    grade: s.grade,
    confidence: s.confidence,
    summary: s.summary,
    detectedIssues: s.issues,
    authenticityVerified: s.verified,
    listingPrice: inr(s.listingPaise),
    history,
    healthCardUrl: `https://reloop.app/c/${s.id}`,
    issuedAt: `${s.listedAt}T09:01:00.000Z`,
  };
}

function toShopItem(s: Spec): ShopItem {
  return {
    id: s.id,
    category: s.category,
    imageUrl: s.imageUrl,
    sellerName: s.sellerName,
    originalPrice: inr(s.originalPaise),
    listingPrice: inr(s.listingPaise),
    card: buildCard(s),
    impact: estimateImpact(s.category, inr(s.listingPaise)),
  };
}

// Each product uses a distinct catalog photo. Items mapped to real users in
// lib/market.ts (pegasus, sony, coach, watch) appear in others' shops and the
// owner's My Listings; the rest are external sellers.
const SPECS: Spec[] = [
  // --- Users' listings (cross-user resale) ---------------------------------
  {
    id: HERO_ID,
    title: 'Nike Air Jordan 1',
    category: 'sports',
    imageUrl: '/catalog/pegasus.jpg',
    sellerName: 'Aarav Shah',
    grade: 'like-new',
    confidence: 0.94,
    summary: 'Worn a handful of times — clean leather, crisp sole, no creasing.',
    issues: ['Faint toe crease'],
    verified: true,
    originalPaise: 999900, // ₹9,999
    listingPaise: 399900, // ₹3,999 — hero discount
    listedAt: '2025-06-10',
  },
  {
    id: 'shop_sony',
    title: 'Apple AirPods Max',
    category: 'electronics',
    imageUrl: '/catalog/sony-headphones.jpg',
    sellerName: 'Meera Iyer',
    grade: 'good',
    confidence: 0.88,
    summary: 'Over-ear, excellent ANC. Light cosmetic wear on the headband.',
    issues: ['Minor scuff on headband', 'Slight ear-cup shine'],
    verified: true,
    originalPaise: 2999000, // ₹29,990
    listingPaise: 1650000, // ₹16,500
    listedAt: '2025-06-05',
  },
  {
    id: 'shop_coach',
    title: 'Prada Galleria Handbag',
    category: 'fashion',
    imageUrl: '/catalog/coach-handbag.jpg',
    sellerName: 'Ananya Rao',
    grade: 'like-new',
    confidence: 0.91,
    summary: 'Barely used, stored in dust bag. Hardware bright, leather supple.',
    issues: [],
    verified: false,
    originalPaise: 2500000, // ₹25,000
    listingPaise: 1200000, // ₹12,000
    listedAt: '2025-05-29',
  },
  {
    id: 'shop_watch',
    title: 'Classic Automatic Watch',
    category: 'fashion',
    imageUrl: '/catalog/apple-watch.jpg',
    sellerName: 'Rohan Verma',
    grade: 'good',
    confidence: 0.87,
    summary: 'Automatic chronograph on a leather strap. Light wear on the band.',
    issues: ['Light strap wear'],
    verified: true,
    originalPaise: 4500000, // ₹45,000
    listingPaise: 2200000, // ₹22,000
    listedAt: '2025-06-02',
  },

  // --- External sellers ----------------------------------------------------
  {
    id: 'shop_iphone',
    title: 'iPhone 13 Pro · 128GB',
    category: 'electronics',
    imageUrl: '/catalog/iphone.jpg',
    sellerName: 'Meghna · Pune',
    grade: 'good',
    confidence: 0.85,
    summary: 'Battery health 89%. Screen flawless, minor edge wear on the frame.',
    issues: ['Light edge wear', 'Battery at 89%'],
    verified: true,
    originalPaise: 11999000, // ₹1,19,990
    listingPaise: 6500000, // ₹65,000
    listedAt: '2025-06-08',
  },
  {
    id: 'shop_asics',
    title: 'Sports Sneakers',
    category: 'sports',
    imageUrl: '/catalog/ultraboost.jpg',
    sellerName: 'Ishaan · Chennai',
    grade: 'good',
    confidence: 0.86,
    summary: 'Lightweight everyday sneakers, light outsole wear. Lots of life left.',
    issues: ['Outsole wear', 'Faint scuffs'],
    verified: true,
    originalPaise: 799900, // ₹7,999
    listingPaise: 349900, // ₹3,499
    listedAt: '2025-06-06',
  },
  {
    id: 'shop_speaker',
    title: 'Amazon Echo Plus',
    category: 'electronics',
    imageUrl: '/catalog/jbl-speaker.jpg',
    sellerName: 'Vihaan · Jaipur',
    grade: 'like-new',
    confidence: 0.9,
    summary: 'Smart speaker with great sound, barely used. Holds full charge.',
    issues: [],
    verified: true,
    originalPaise: 1499000, // ₹14,990
    listingPaise: 700000, // ₹7,000
    listedAt: '2025-06-07',
  },
  {
    id: 'shop_tote',
    title: 'Black Leather Handbag',
    category: 'fashion',
    imageUrl: '/catalog/tote-bag.jpg',
    sellerName: 'Saanvi · Ahmedabad',
    grade: 'good',
    confidence: 0.88,
    summary: 'Structured leather handbag, light corner wear. Lining spotless.',
    issues: ['Light corner wear'],
    verified: false,
    originalPaise: 899900, // ₹8,999
    listingPaise: 420000, // ₹4,200
    listedAt: '2025-05-31',
  },
  {
    id: 'shop_console',
    title: 'Retro Game Console',
    category: 'toys',
    imageUrl: '/catalog/ps5.jpg',
    sellerName: 'Dev · Kolkata',
    grade: 'fair',
    confidence: 0.8,
    summary: 'Powers on, classic woodgrain finish. Some shelf wear, no controllers.',
    issues: ['Shelf wear', 'No controllers included'],
    verified: true,
    originalPaise: 1499900, // ₹14,999
    listingPaise: 600000, // ₹6,000
    listedAt: '2025-06-01',
  },
];

export const shopItems: ShopItem[] = SPECS.map(toShopItem);

export function findShopItem(id: string): ShopItem | undefined {
  return shopItems.find((i) => i.id === id);
}

export const heroShopItem = findShopItem(HERO_ID)!;
