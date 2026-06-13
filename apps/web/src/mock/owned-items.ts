import type { Money, OwnedItem } from '@reloop/shared';

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

// Every item was bought from the seller (UrbanThread). Pre-grading facts only —
// NO condition is shown before the AI grades the user's live photos.
// originalListingImages + originalSpecs are the "as listed" reference the grader
// diffs against during resale.
export const ownedItems: UserOwnedItem[] = [
  // --- Aarav ---------------------------------------------------------------
  {
    id: 'own_ua_charged',
    ownerId: 'user_aarav',
    title: 'Under Armour Charged Assert 10',
    category: 'sports',
    imageUrl: '/catalog/ua-shoes.jpg',
    purchaseDate: '2024-02-10',
    originalPrice: inr(699900), // ₹6,999
    description: 'Everyday running shoes. Replaced with a newer pair.',
    returnEligible: false, // bought long ago → resell
    originalListingImages: ['/catalog/ua-shoes.jpg'],
    originalSpecs: {
      Model: 'Charged Assert 10',
      'Style #': '3026175-101',
      Color: 'White',
      Size: 'US 10',
    },
  },
  {
    id: 'own_boat_headphones',
    ownerId: 'user_aarav',
    title: 'boAt Rockerz 550 Headphones',
    category: 'electronics',
    imageUrl: '/catalog/boat-headphones.jpg',
    purchaseDate: '2026-06-02',
    originalPrice: inr(199900), // ₹1,999
    description: 'Just arrived — the fit isn’t right.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-06-19',
    orderId: 'ORD-2001',
    originalListingImages: ['/catalog/boat-headphones.jpg'],
    originalSpecs: { Model: 'Rockerz 550', Color: 'Black' },
  },

  // --- Meera ---------------------------------------------------------------
  {
    id: 'own_puma',
    ownerId: 'user_meera',
    title: 'Puma Slipstream Sneakers',
    category: 'fashion',
    imageUrl: '/catalog/puma-sneakers.jpg',
    purchaseDate: '2023-12-02',
    originalPrice: inr(899900), // ₹8,999
    description: 'Retro court sneakers. Grew out of the style.',
    returnEligible: false, // bought long ago → resell
    originalListingImages: ['/catalog/puma-sneakers.jpg'],
    originalSpecs: { Model: '392434-01', Color: 'White/Vapor Gray', Size: 'US 9' },
  },
  {
    id: 'own_canon_camera',
    ownerId: 'user_meera',
    title: 'Canon EOS M50 Camera',
    category: 'electronics',
    imageUrl: '/catalog/canon-camera.jpg',
    purchaseDate: '2026-05-30',
    originalPrice: inr(549900), // ₹5,499
    description: 'Arrived last week — heavier than expected.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-06-16',
    orderId: 'ORD-2002',
    originalListingImages: ['/catalog/canon-camera.jpg'],
    originalSpecs: { Model: 'EOS M50', Color: 'Black', Kit: '15-45mm lens' },
  },

  // --- Rohan ---------------------------------------------------------------
  {
    id: 'own_wildcraft_backpack',
    ownerId: 'user_rohan',
    title: 'Wildcraft Trekking Backpack',
    category: 'fashion',
    imageUrl: '/catalog/backpack.jpg',
    purchaseDate: '2023-09-18',
    originalPrice: inr(349900), // ₹3,499
    description: 'Used for two treks. Switched to a bigger pack.',
    returnEligible: false,
    originalListingImages: ['/catalog/backpack.jpg'],
    originalSpecs: { Model: 'Trailblazer 45L', Color: 'Grey' },
  },
  {
    id: 'own_galaxy_a54',
    ownerId: 'user_rohan',
    title: 'Samsung Galaxy A54',
    category: 'electronics',
    imageUrl: '/catalog/galaxy-phone.jpg',
    purchaseDate: '2026-06-04',
    originalPrice: inr(389900), // ₹3,899
    description: 'Bought as a backup — don’t need it after all.',
    returnEligible: true,
    returnByDate: '2026-06-21',
    orderId: 'ORD-2003',
    originalListingImages: ['/catalog/galaxy-phone.jpg'],
    originalSpecs: { Model: 'Galaxy A54 5G', Color: 'Awesome Graphite', Storage: '128GB' },
  },

  // --- Ananya --------------------------------------------------------------
  {
    id: 'own_nike_revolution',
    ownerId: 'user_ananya',
    title: 'Nike Revolution 6',
    category: 'sports',
    imageUrl: '/catalog/nike-revolution.jpg',
    purchaseDate: '2023-11-22',
    originalPrice: inr(379900), // ₹3,799
    description: 'Light running shoes. Moved on to trail shoes.',
    returnEligible: false,
    originalListingImages: ['/catalog/nike-revolution.jpg'],
    originalSpecs: { Model: 'Revolution 6', Color: 'Black/White', Size: 'US 7' },
  },
  {
    id: 'own_jbl_tune',
    ownerId: 'user_ananya',
    title: 'JBL Tune 760NC',
    category: 'electronics',
    imageUrl: '/catalog/jbl-headphones.jpg',
    purchaseDate: '2026-06-01',
    originalPrice: inr(599900), // ₹5,999
    description: 'Comfortable but the ANC isn’t for me.',
    returnEligible: true,
    returnByDate: '2026-06-18',
    orderId: 'ORD-2004',
    originalListingImages: ['/catalog/jbl-headphones.jpg'],
    originalSpecs: { Model: 'Tune 760NC', Color: 'Black' },
  },
];

export function getOwnedItems(accountId: string): UserOwnedItem[] {
  return ownedItems.filter((i) => i.ownerId === accountId);
}

export function findOwnedItem(id: string): UserOwnedItem | undefined {
  return ownedItems.find((i) => i.id === id);
}
