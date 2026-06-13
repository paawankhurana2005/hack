// Curated demo products for "Try a sample item". Images are bundled under
// public/demo/ (license-free, sourced from Unsplash). Picking a sample runs the
// REAL grading pipeline on these photos — output is genuine, not canned.

import type { ItemCategory } from '@reloop/shared';

export interface DemoItem {
  id: string;
  title: string;
  category: ItemCategory;
  notes?: string;
  /** Same-origin paths under public/. */
  imagePaths: string[];
}

export const demoItems: DemoItem[] = [
  {
    id: 'demo-puma-slipstream',
    title: 'PUMA Slipstream Sneakers',
    category: 'sports',
    notes: 'PUMA Slipstream, white/grey, gum sole. Model 392434-01, UK 8.5.',
    // Real used pair, multiple angles + the size/model label — richer grading.
    imagePaths: [
      '/demo/puma-slipstream/side.jpg',
      '/demo/puma-slipstream/profile.jpg',
      '/demo/puma-slipstream/top.jpg',
      '/demo/puma-slipstream/label.jpg',
    ],
  },
  {
    id: 'demo-sneakers',
    title: 'Nike Free RN Running Shoes',
    category: 'sports',
    notes: 'Worn a handful of times.',
    imagePaths: ['/demo/sneakers.jpg'],
  },
  {
    id: 'demo-headphones',
    title: 'Wireless Over-Ear Headphones',
    category: 'electronics',
    imagePaths: ['/demo/headphones.jpg'],
  },
  {
    id: 'demo-handbag',
    title: 'Leather Top-Handle Handbag',
    category: 'fashion',
    imagePaths: ['/demo/handbag.jpg'],
  },
  {
    id: 'demo-smartphone',
    title: 'Smartphone (unlocked)',
    category: 'electronics',
    imagePaths: ['/demo/smartphone.jpg'],
  },
  {
    id: 'demo-camera',
    title: 'Mirrorless Camera with Lenses',
    category: 'electronics',
    imagePaths: ['/demo/camera.jpg'],
  },
];
