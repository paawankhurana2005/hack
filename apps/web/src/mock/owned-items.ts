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
    imageUrl: '/demo/ua-charged/front.jpg',
    purchaseDate: '2024-02-10',
    originalPrice: inr(699900), // ₹6,999
    description: 'Everyday running shoes. Replaced with a newer pair.',
    returnEligible: false, // bought long ago → resell
    originalListingImages: [
      '/demo/ua-charged/front.jpg',
      '/demo/ua-charged/side.jpg',
      '/demo/ua-charged/sole.jpg',
    ],
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
    imageUrl: '/demo/headphones.jpg',
    purchaseDate: '2026-06-02',
    originalPrice: inr(199900), // ₹1,999
    description: 'Just arrived — the fit isn’t right.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-06-19',
    orderId: 'ORD-2001',
    originalListingImages: ['/demo/headphones.jpg'],
    originalSpecs: { Model: 'Rockerz 550', Color: 'Black' },
  },

  // --- Meera ---------------------------------------------------------------
  {
    id: 'own_puma',
    ownerId: 'user_meera',
    title: 'Puma Slipstream Sneakers',
    category: 'fashion',
    imageUrl: '/demo/puma-slipstream/profile.jpg',
    purchaseDate: '2023-12-02',
    originalPrice: inr(899900), // ₹8,999
    description: 'Retro court sneakers. Grew out of the style.',
    returnEligible: false, // bought long ago → resell
    originalListingImages: [
      '/demo/puma-slipstream/profile.jpg',
      '/demo/puma-slipstream/side.jpg',
      '/demo/puma-slipstream/top.jpg',
      '/demo/puma-slipstream/label.jpg',
    ],
    originalSpecs: { Model: '392434-01', Color: 'White/Vapor Gray', Size: 'US 9' },
  },
  {
    id: 'own_canon_camera',
    ownerId: 'user_meera',
    title: 'Canon EOS M50 Camera',
    category: 'electronics',
    imageUrl: '/demo/camera.jpg',
    purchaseDate: '2026-05-30',
    originalPrice: inr(549900), // ₹5,499
    description: 'Arrived last week — heavier than expected.',
    returnEligible: true, // within the return window → return
    returnByDate: '2026-06-16',
    orderId: 'ORD-2002',
    originalListingImages: ['/demo/camera.jpg'],
    originalSpecs: { Model: 'EOS M50', Color: 'Black', Kit: '15-45mm lens' },
  },
];

export function getOwnedItems(accountId: string): UserOwnedItem[] {
  return ownedItems.filter((i) => i.ownerId === accountId);
}

export function findOwnedItem(id: string): UserOwnedItem | undefined {
  return ownedItems.find((i) => i.id === id);
}
