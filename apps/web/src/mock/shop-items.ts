import {
  estimateImpact,
  type ConditionGrade,
  type ItemCategory,
  type Money,
  type ProductHealthCard,
  type ShopItem,
} from '@reloop/shared';

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

// The user's own listed hero — appears in the Shop AND in My Listings (one person
// plays both sides). Buying it flips it to Sold in My Listings via the shared store.
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

const SPECS: Spec[] = [
  {
    id: HERO_ID,
    title: 'Nike Air Zoom Pegasus 40',
    category: 'sports',
    imageUrl: '/demo/sneakers.jpg',
    sellerName: 'You',
    grade: 'like-new',
    confidence: 0.94,
    summary: 'Worn twice — clean uppers, crisp tread, no creasing. Practically new.',
    issues: ['Faint crease on left toe box'],
    verified: true,
    originalPaise: 999900, // ₹9,999
    listingPaise: 399900, // ₹3,999 — hero discount
    listedAt: '2025-06-10',
  },
  {
    id: 'shop_sony',
    title: 'Sony WH-1000XM4 Headphones',
    category: 'electronics',
    imageUrl: '/demo/headphones.jpg',
    sellerName: 'Aarav · Bengaluru',
    grade: 'good',
    confidence: 0.88,
    summary: 'Fully functional, light cosmetic wear on the headband. Pads intact.',
    issues: ['Minor scuff on headband', 'Slight ear-pad shine'],
    verified: true,
    originalPaise: 2999000, // ₹29,990
    listingPaise: 1650000, // ₹16,500
    listedAt: '2025-06-05',
  },
  {
    id: 'shop_iphone',
    title: 'iPhone 13 · 128GB',
    category: 'electronics',
    imageUrl: '/demo/smartphone.jpg',
    sellerName: 'Meera · Pune',
    grade: 'good',
    confidence: 0.85,
    summary: 'Battery health 89%. Screen flawless, minor edge wear on the frame.',
    issues: ['Light edge wear', 'Battery at 89%'],
    verified: true,
    originalPaise: 6990000, // ₹69,900
    listingPaise: 3800000, // ₹38,000
    listedAt: '2025-06-08',
  },
  {
    id: 'shop_coach',
    title: 'Coach Leather Handbag',
    category: 'fashion',
    imageUrl: '/demo/handbag.jpg',
    sellerName: 'Ananya · Delhi',
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
    id: 'shop_canon',
    title: 'Canon EOS M50 Camera',
    category: 'electronics',
    imageUrl: '/demo/camera.jpg',
    sellerName: 'Rohan · Mumbai',
    grade: 'fair',
    confidence: 0.79,
    summary: 'Works well, visible use. Low shutter count, kit lens included.',
    issues: ['Scuffs on body', 'Small mark near grip'],
    verified: true,
    originalPaise: 5499000, // ₹54,990
    listingPaise: 2400000, // ₹24,000
    listedAt: '2025-06-01',
  },
  {
    id: 'shop_puma',
    title: 'Puma Slipstream Sneakers',
    category: 'fashion',
    imageUrl: '/demo/puma-slipstream/profile.jpg',
    sellerName: 'Kabir · Hyderabad',
    grade: 'good',
    confidence: 0.9,
    summary: 'Retro court sneakers, light creasing, soles clean. Lots of life left.',
    issues: ['Light creasing', 'Faint sole scuff'],
    verified: true,
    originalPaise: 899900, // ₹8,999
    listingPaise: 480000, // ₹4,800
    listedAt: '2025-06-03',
  },
];

export const shopItems: ShopItem[] = SPECS.map(toShopItem);

export function findShopItem(id: string): ShopItem | undefined {
  return shopItems.find((i) => i.id === id);
}

export const heroShopItem = findShopItem(HERO_ID)!;
