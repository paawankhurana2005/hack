import type { Money, OwnedItem } from '@reloop/shared';
import { STAGED_ITEM_ID, STAGED_ACQUIRED_AT } from './provenance-seed';

export type { OwnedItem };

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

/** An owned item, tagged to a user and to its return eligibility. */
export interface UserOwnedItem extends OwnedItem {
  ownerId: string;
  /** Within the return window → routes to the Return flow. Else → resell. */
  returnEligible: boolean;
  /** Display deadline for eligible items. */
  returnByDate?: string;
  /** Order this item maps to in the return flow (eligible items only). */
  orderId?: string;
}

// Every item was bought from the seller. Pre-grading facts only — NO condition is
// shown before the AI grades the user's live photos. originalListingImages +
// originalSpecs are the "as listed" reference the grader diffs against on resale.
export const ownedItems: UserOwnedItem[] = [
  // --- Aarav ---------------------------------------------------------------
  {
    id: 'own_ua_charged',
    itemId: 'itm_ua_charged',
    ownerId: 'user_aarav',
    title: 'Under Armour Charged Assert',
    category: 'sports',
    imageUrl: '/demo/ua-charged/front.jpg',
    purchaseDate: '2024-02-10',
    originalPrice: inr(699900), // ₹6,999
    description: 'Everyday running shoes. Replaced with a newer pair.',
    returnEligible: false, // bought long ago → resell
    originalListingImages: ['/demo/ua-charged/front.jpg', '/demo/ua-charged/side.jpg', '/demo/ua-charged/sole.jpg'],
    originalSpecs: { Color: 'White / Black', Size: 'US 10' },
  },
  {
    id: 'own_boat_headphones',
    itemId: 'itm_boat_headphones',
    ownerId: 'user_aarav',
    title: 'Apple AirPods',
    category: 'electronics',
    imageUrl: '/catalog/boat-headphones.jpg',
    purchaseDate: '2026-06-02',
    originalPrice: inr(1490000), // ₹14,900
    description: 'Just arrived — prefer over-ear instead.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-06-19',
    orderId: 'ORD-2001',
    originalListingImages: ['/catalog/boat-headphones.jpg'],
    originalSpecs: { Model: 'AirPods (2nd Gen)', Color: 'White' },
  },

  // --- Meera ---------------------------------------------------------------
  {
    id: 'own_puma',
    itemId: 'itm_puma',
    ownerId: 'user_meera',
    title: 'Puma Future Rider Trainers',
    category: 'fashion',
    imageUrl: '/catalog/puma-sneakers.jpg',
    purchaseDate: '2023-12-02',
    originalPrice: inr(899900), // ₹8,999
    description: 'Retro trainers. Grew out of the style.',
    returnEligible: false, // bought long ago → resell
    originalListingImages: ['/catalog/puma-sneakers.jpg'],
    originalSpecs: { Color: 'White / Grey', Size: 'US 9' },
  },
  {
    id: 'own_canon_camera',
    itemId: 'itm_canon_camera',
    ownerId: 'user_meera',
    title: 'Apple iPad Mini',
    category: 'electronics',
    imageUrl: '/catalog/canon-camera.jpg',
    purchaseDate: '2026-05-30',
    originalPrice: inr(4990000), // ₹49,900
    description: 'Arrived last week — barely used it.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-06-16',
    orderId: 'ORD-2002',
    originalListingImages: ['/catalog/canon-camera.jpg'],
    originalSpecs: { Model: 'iPad Mini 2021', Color: 'Starlight', Storage: '64GB' },
  },
  // The STAGED demo item — Meera bought this through ReLoop (Amazon → Aarav →
  // Meera). It already carries a populated provenance chain (provenance-seed.ts);
  // re-listing it on stage appends a SECOND life to that same chain.
  {
    id: 'own_meera_ultraboost',
    itemId: STAGED_ITEM_ID,
    ownerId: 'user_meera',
    title: 'Adidas Ultraboost Light',
    category: 'sports',
    imageUrl: '/catalog/ultraboost.jpg',
    purchaseDate: STAGED_ACQUIRED_AT,
    originalPrice: inr(799900), // ₹7,999 new
    description: 'Bought second-hand through ReLoop — barely worn since. Passing it on.',
    returnEligible: false, // a second-life buy → resell, never a return
    originalListingImages: ['/catalog/ultraboost.jpg'],
    originalSpecs: { Color: 'Core Black', Size: 'US 9' },
  },
  {
    id: 'own_meera_airpods_pro',
    itemId: 'itm_meera_airpods_pro',
    ownerId: 'user_meera',
    title: 'Apple AirPods Pro (2nd Gen)',
    category: 'electronics',
    imageUrl: '/catalog/airpods-pro.jpg', // studio product shot
    purchaseDate: '2026-07-03',
    originalPrice: inr(2490000), // ₹24,900
    description: 'Just arrived — the fit isn’t sealing well for me.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-07-20',
    orderId: 'ORD-2006',
    originalListingImages: ['/catalog/airpods-pro.jpg'],
    originalSpecs: { Model: 'AirPods Pro (2nd Gen)', Color: 'White' },
  },
  {
    id: 'own_meera_nike_hoodie',
    itemId: 'itm_meera_nike_hoodie',
    ownerId: 'user_meera',
    title: 'Nike Sportswear Club Fleece Hoodie',
    category: 'fashion',
    imageUrl: '/catalog/official-nike-hoodie.jpg', // official Nike.com asset
    purchaseDate: '2026-07-04',
    originalPrice: inr(549500), // ₹5,495
    description: 'Comfortable, but the fit runs large — returning for a smaller size.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-07-21',
    orderId: 'ORD-2010',
    originalListingImages: ['/catalog/official-nike-hoodie.jpg'],
    originalSpecs: { Model: 'Sportswear Club Fleece', Color: 'Dark Grey Heather', Size: 'L' },
  },

  // --- Rohan ---------------------------------------------------------------
  {
    id: 'own_wildcraft_backpack',
    itemId: 'itm_wildcraft_backpack',
    ownerId: 'user_rohan',
    title: 'Faux Leather Backpack',
    category: 'fashion',
    imageUrl: '/catalog/backpack.jpg',
    purchaseDate: '2023-09-18',
    originalPrice: inr(349900), // ₹3,499
    description: 'Used for a season. Switched to a bigger bag.',
    returnEligible: false,
    originalListingImages: ['/catalog/backpack.jpg'],
    originalSpecs: { Color: 'White' },
  },
  {
    id: 'own_rohan_nike_dunk',
    itemId: 'itm_rohan_nike_dunk',
    ownerId: 'user_rohan',
    title: 'Nike Dunk Low Retro',
    category: 'sports',
    imageUrl: '/catalog/shopping.jpg',
    purchaseDate: '2026-07-02',
    originalPrice: inr(929500), // ₹9,295
    description: 'Colour looked different online — returning within the window.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-07-19',
    orderId: 'ORD-2011',
    originalListingImages: ['/catalog/shopping.jpg'],
    originalSpecs: { Model: 'Dunk Low Retro', Color: 'White / Armory Navy', Size: 'US 9' },
  },

  // --- Ananya --------------------------------------------------------------
  {
    id: 'own_nike_revolution',
    itemId: 'itm_nike_revolution',
    ownerId: 'user_ananya',
    title: 'Nike Baseball Cleats',
    category: 'sports',
    imageUrl: '/catalog/nike-revolution.jpg',
    purchaseDate: '2023-11-22',
    originalPrice: inr(379900), // ₹3,799
    description: 'Used one season. Moved on from the sport.',
    returnEligible: false,
    originalListingImages: ['/catalog/nike-revolution.jpg'],
    originalSpecs: { Color: 'Black / White', Size: 'US 7' },
  },
  {
    id: 'own_jbl_tune',
    itemId: 'itm_jbl_tune',
    ownerId: 'user_ananya',
    title: 'Wireless Earbuds',
    category: 'electronics',
    imageUrl: '/catalog/jbl-headphones.jpg',
    purchaseDate: '2026-06-01',
    originalPrice: inr(599900), // ₹5,999
    description: 'Comfortable, but the fit isn’t for me.',
    returnEligible: true,
    returnByDate: '2026-06-18',
    orderId: 'ORD-2004',
    originalListingImages: ['/catalog/jbl-headphones.jpg'],
    originalSpecs: { Color: 'Black' },
  },
  {
    id: 'own_ananya_galaxy_s23',
    itemId: 'itm_ananya_galaxy_s23',
    ownerId: 'user_ananya',
    title: 'Samsung Galaxy S23 Ultra',
    category: 'electronics',
    imageUrl: '/catalog/galaxy-s23.png', // studio product shot
    purchaseDate: '2026-07-04',
    originalPrice: inr(12499900), // ₹1,24,999
    description: 'Switched my mind on the colour — returning within the window.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-07-21',
    orderId: 'ORD-2008',
    originalListingImages: ['/catalog/galaxy-s23.png'],
    originalSpecs: { Model: 'Galaxy S23 Ultra', Color: 'Phantom Black', Storage: '256GB' },
  },
  {
    id: 'own_ananya_nike_tee',
    itemId: 'itm_ananya_nike_tee',
    ownerId: 'user_ananya',
    title: 'Nike Sportswear Club T-Shirt',
    category: 'fashion',
    imageUrl: '/catalog/official-nike-tee.jpg', // official Nike.com asset
    purchaseDate: '2026-07-05',
    originalPrice: inr(219500), // ₹2,195
    description: 'Nice tee, but I ordered two — returning the extra.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-07-22',
    orderId: 'ORD-2012',
    originalListingImages: ['/catalog/official-nike-tee.jpg'],
    originalSpecs: { Model: 'Sportswear Club Tee', Color: 'White', Size: 'M' },
  },

  // --- Kabir (Chennai) -----------------------------------------------------
  {
    id: 'own_kabir_airmax90',
    itemId: 'itm_kabir_airmax90',
    ownerId: 'user_kabir',
    title: 'Nike Air Max 90',
    category: 'sports',
    imageUrl: '/catalog/official-nike-airmax90.jpg', // official Nike.com asset
    purchaseDate: '2026-07-04',
    originalPrice: inr(1099500), // ₹10,995
    description: 'Just arrived — the fit runs half a size small, returning it.',
    returnEligible: true,
    returnByDate: '2026-07-21',
    orderId: 'ORD-2014',
    originalListingImages: ['/catalog/official-nike-airmax90.jpg'],
    originalSpecs: { Model: 'Air Max 90', Color: 'Summit White / Grey', Size: 'US 9' },
  },
  {
    id: 'own_kabir_airpods',
    itemId: 'itm_kabir_airpods',
    ownerId: 'user_kabir',
    title: 'Apple AirPods Pro (2nd Gen)',
    category: 'electronics',
    imageUrl: '/catalog/airpods-pro.jpg',
    purchaseDate: '2026-07-05',
    originalPrice: inr(2490000), // ₹24,900
    description: 'Received as a gift — already own a pair, returning this one.',
    returnEligible: true,
    returnByDate: '2026-07-22',
    orderId: 'ORD-2015',
    originalListingImages: ['/catalog/airpods-pro.jpg'],
    originalSpecs: { Model: 'AirPods Pro (2nd Gen)', Color: 'White' },
  },

  // --- Diya (Hyderabad) ----------------------------------------------------
  {
    id: 'own_diya_dunk',
    itemId: 'itm_diya_dunk',
    ownerId: 'user_diya',
    title: 'Nike Dunk Low Retro',
    category: 'sports',
    imageUrl: '/catalog/official-nike-dunk.jpg', // official Nike.com asset
    purchaseDate: '2026-07-03',
    originalPrice: inr(929500), // ₹9,295
    description: 'Loved the look, but they pinch at the toe — returning.',
    returnEligible: true,
    returnByDate: '2026-07-20',
    orderId: 'ORD-2016',
    originalListingImages: ['/catalog/official-nike-dunk.jpg'],
    originalSpecs: { Model: 'Dunk Low Retro', Color: 'White / Black', Size: 'US 7' },
  },
  {
    id: 'own_diya_stanley',
    itemId: 'itm_diya_stanley',
    ownerId: 'user_diya',
    title: 'Stanley Quencher H2.0 Tumbler 40oz',
    category: 'home',
    imageUrl: '/catalog/official-stanley-quencher.png', // official Stanley1913.com asset
    purchaseDate: '2026-07-04',
    originalPrice: inr(399900), // ₹3,999
    description: 'Bigger than expected for my bag — sending it back.',
    returnEligible: true,
    returnByDate: '2026-07-21',
    orderId: 'ORD-2017',
    originalListingImages: ['/catalog/official-stanley-quencher.png'],
    originalSpecs: { Model: 'Quencher H2.0 FlowState 40oz', Color: 'Frost' },
  },

  // --- Ishaan (Kolkata) ----------------------------------------------------
  {
    id: 'own_ishaan_af1',
    itemId: 'itm_ishaan_af1',
    ownerId: 'user_ishaan',
    title: "Nike Air Force 1 '07",
    category: 'sports',
    imageUrl: '/catalog/official-nike-af1.jpg', // official Nike.com asset
    purchaseDate: '2026-07-02',
    originalPrice: inr(969500), // ₹9,695
    description: 'Ordered two colours to compare — returning the black pair.',
    returnEligible: true,
    returnByDate: '2026-07-19',
    orderId: 'ORD-2018',
    originalListingImages: ['/catalog/official-nike-af1.jpg'],
    originalSpecs: { Model: "Air Force 1 '07", Color: 'Black', Size: 'US 11' },
  },
  {
    id: 'own_ishaan_ps5',
    itemId: 'itm_ishaan_ps5',
    ownerId: 'user_ishaan',
    title: 'Sony PlayStation 5 Console',
    category: 'toys',
    imageUrl: '/catalog/ps5-console.png',
    purchaseDate: '2026-07-03',
    originalPrice: inr(5499000), // ₹54,990
    description: 'Gifted one the same week — returning the duplicate.',
    returnEligible: true,
    returnByDate: '2026-07-20',
    orderId: 'ORD-2019',
    originalListingImages: ['/catalog/ps5-console.png'],
    originalSpecs: { Model: 'PS5 (Disc Edition)', Color: 'White' },
  },

  // --- Priya (Jaipur) ------------------------------------------------------
  {
    id: 'own_priya_hoodie',
    itemId: 'itm_priya_hoodie',
    ownerId: 'user_priya',
    title: 'Nike Sportswear Club Fleece Hoodie',
    category: 'fashion',
    imageUrl: '/catalog/official-nike-hoodie.jpg', // official Nike.com asset
    purchaseDate: '2026-07-05',
    originalPrice: inr(549500), // ₹5,495
    description: 'Colour was darker than the photo — returning for grey.',
    returnEligible: true,
    returnByDate: '2026-07-22',
    orderId: 'ORD-2020',
    originalListingImages: ['/catalog/official-nike-hoodie.jpg'],
    originalSpecs: { Model: 'Sportswear Club Fleece', Color: 'Black', Size: 'M' },
  },
  {
    id: 'own_priya_galaxy',
    itemId: 'itm_priya_galaxy',
    ownerId: 'user_priya',
    title: 'Samsung Galaxy S23 Ultra',
    category: 'electronics',
    imageUrl: '/catalog/galaxy-s23.png',
    purchaseDate: '2026-07-04',
    originalPrice: inr(12499900), // ₹1,24,999
    description: 'Sticking with my current phone — returning within the window.',
    returnEligible: true,
    returnByDate: '2026-07-21',
    orderId: 'ORD-2021',
    originalListingImages: ['/catalog/galaxy-s23.png'],
    originalSpecs: { Model: 'Galaxy S23 Ultra', Color: 'Phantom Black', Storage: '256GB' },
  },
];

export function getOwnedItems(accountId: string): UserOwnedItem[] {
  return ownedItems.filter((i) => i.ownerId === accountId);
}

export function findOwnedItem(id: string): UserOwnedItem | undefined {
  return ownedItems.find((i) => i.id === id);
}
