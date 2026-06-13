import type { Money, OwnedItem } from '@reloop/shared';

export type { OwnedItem };

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

// The user's real order history. Pre-grading facts only — NO condition is shown
// before the AI grades the user's live photos. originalListingImages + originalSpecs
// are the "as listed on Amazon" reference the grader diffs against.
export const ownedItems: OwnedItem[] = [
  {
    id: 'own_ua_charged',
    title: 'Under Armour Charged Assert 10',
    category: 'sports',
    imageUrl: '/demo/ua-charged/front.jpg',
    purchaseDate: '2024-02-10',
    originalPrice: inr(699900), // ₹6,999
    description: 'Everyday running shoes. Replaced with a newer pair.',
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
    id: 'own_puma',
    title: 'Puma Slipstream Sneakers',
    category: 'fashion',
    imageUrl: '/demo/puma-slipstream/profile.jpg',
    purchaseDate: '2023-12-02',
    originalPrice: inr(899900), // ₹8,999
    description: 'Retro court sneakers. Grew out of the style.',
    originalListingImages: [
      '/demo/puma-slipstream/profile.jpg',
      '/demo/puma-slipstream/side.jpg',
      '/demo/puma-slipstream/top.jpg',
      '/demo/puma-slipstream/label.jpg',
    ],
    originalSpecs: { Model: '392434-01', Color: 'White/Vapor Gray', Size: 'US 9' },
  },
];

export function findOwnedItem(id: string): OwnedItem | undefined {
  return ownedItems.find((i) => i.id === id);
}
