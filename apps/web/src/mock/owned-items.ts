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
    title: 'White Court Sneakers',
    category: 'sports',
    imageUrl: '/catalog/ua-shoes.jpg',
    purchaseDate: '2024-02-10',
    originalPrice: inr(699900), // ₹6,999
    description: 'Everyday sneakers. Replaced with a newer pair.',
    returnEligible: false, // bought long ago → resell
    originalListingImages: ['/catalog/ua-shoes.jpg'],
    originalSpecs: { Color: 'White / Red', Size: 'US 10' },
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
    id: 'own_galaxy_a54',
    itemId: 'itm_galaxy_a54',
    ownerId: 'user_rohan',
    title: 'Oppo A57',
    category: 'electronics',
    imageUrl: '/catalog/galaxy-phone.jpg',
    purchaseDate: '2026-06-04',
    originalPrice: inr(1890000), // ₹18,900
    description: 'Bought as a backup — don’t need it after all.',
    returnEligible: true,
    returnByDate: '2026-06-21',
    orderId: 'ORD-2003',
    originalListingImages: ['/catalog/galaxy-phone.jpg'],
    originalSpecs: { Model: 'A57', Color: 'Gold', Storage: '128GB' },
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
];

export function getOwnedItems(accountId: string): UserOwnedItem[] {
  return ownedItems.filter((i) => i.ownerId === accountId);
}

export function findOwnedItem(id: string): UserOwnedItem | undefined {
  return ownedItems.find((i) => i.id === id);
}
