import type { Money, OwnedItem } from '@reloop/shared';

export type { OwnedItem };

const usd = (amountCents: number): Money => ({ amountCents, currency: 'USD' });

// Mock "order history". Pre-grading facts only — NO condition is shown before the
// AI grades the user's photos. originalListingImages + originalSpecs are the
// reference the grader diffs against.
export const ownedItems: OwnedItem[] = [
  {
    id: 'own_headphones',
    title: 'Sony WH-1000XM4 Headphones',
    category: 'electronics',
    imageUrl: '/demo/headphones.jpg',
    purchaseDate: '2024-03-12',
    originalPrice: usd(34800),
    description: 'Noise-cancelling over-ear headphones, barely used since upgrading.',
    originalListingImages: ['/demo/headphones.jpg'],
    originalSpecs: { Model: 'WH-1000XM4', Color: 'Black', Connectivity: 'Bluetooth 5.0' },
  },
  {
    id: 'own_smartphone',
    title: 'iPhone 13 · 128GB',
    category: 'electronics',
    imageUrl: '/demo/smartphone.jpg',
    purchaseDate: '2023-09-28',
    originalPrice: usd(79900),
    description: 'Replaced after an upgrade. Screen and battery in great shape.',
    originalListingImages: ['/demo/smartphone.jpg'],
    originalSpecs: { Model: 'A2482', Storage: '128GB', Color: 'Midnight' },
  },
  {
    id: 'own_camera',
    title: 'Canon EOS M50 Camera',
    category: 'electronics',
    imageUrl: '/demo/camera.jpg',
    purchaseDate: '2022-11-05',
    originalPrice: usd(64900),
    description: 'Mirrorless camera with kit lens. Outgrew it as a hobby.',
    originalListingImages: ['/demo/camera.jpg'],
    originalSpecs: { Model: 'EOS M50', Lens: '15-45mm kit', Color: 'Black' },
  },
  {
    id: 'own_handbag',
    title: 'Coach Leather Handbag',
    category: 'fashion',
    imageUrl: '/demo/handbag.jpg',
    purchaseDate: '2023-06-18',
    originalPrice: usd(29500),
    description: 'Classic tan leather tote. Used a handful of times.',
    originalListingImages: ['/demo/handbag.jpg'],
    originalSpecs: { Model: 'C5690', Material: 'Pebbled leather', Color: 'Tan' },
  },
  {
    id: 'own_sneakers',
    title: 'Nike Pegasus Runners',
    category: 'sports',
    imageUrl: '/demo/sneakers.jpg',
    purchaseDate: '2024-01-22',
    originalPrice: usd(13000),
    description: 'Road-running shoes, wrong size for me after a few runs.',
    originalListingImages: ['/demo/sneakers.jpg'],
    originalSpecs: { Model: 'Pegasus 40', Size: 'US 10', Color: 'White/Black' },
  },
  {
    // Showcase item for the reference comparison — 4 original listing angles.
    id: 'own_puma',
    title: 'Puma Slipstream Sneakers',
    category: 'fashion',
    imageUrl: '/demo/puma-slipstream/profile.jpg',
    purchaseDate: '2023-12-02',
    originalPrice: usd(9000),
    description: 'Retro court sneakers. Grew out of the style.',
    originalListingImages: [
      '/demo/puma-slipstream/profile.jpg',
      '/demo/puma-slipstream/side.jpg',
      '/demo/puma-slipstream/top.jpg',
      '/demo/puma-slipstream/label.jpg',
    ],
    originalSpecs: { Model: '392434-01', Color: 'White/Green', Size: 'US 9' },
  },
];

export function findOwnedItem(id: string): OwnedItem | undefined {
  return ownedItems.find((i) => i.id === id);
}
