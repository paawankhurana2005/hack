import type { Money } from '@reloop/shared';

export type ListingStatus = 'listed' | 'viewed' | 'matched' | 'sold';

/** A casual second-life listing the user has put up — their lightweight seller identity. */
export interface CasualListing {
  id: string;
  title: string;
  imageUrl: string;
  listedPrice: Money;
  status: ListingStatus;
  views?: number;
  listedAt: string; // ISO
}

const usd = (amountCents: number): Money => ({ amountCents, currency: 'USD' });

export const casualListings: CasualListing[] = [
  {
    id: 'lst_airpods',
    title: 'AirPods Pro (2nd gen)',
    imageUrl: '/demo/headphones.jpg',
    listedPrice: usd(14500),
    status: 'sold',
    views: 64,
    listedAt: '2025-05-02',
  },
  {
    id: 'lst_jacket',
    title: 'Leather Crossbody Bag',
    imageUrl: '/demo/handbag.jpg',
    listedPrice: usd(11000),
    status: 'matched',
    views: 23,
    listedAt: '2025-05-21',
  },
  {
    id: 'lst_phone',
    title: 'Pixel 7 · 128GB',
    imageUrl: '/demo/smartphone.jpg',
    listedPrice: usd(29900),
    status: 'viewed',
    views: 9,
    listedAt: '2025-06-04',
  },
  {
    id: 'lst_camera',
    title: 'Fujifilm Instax Camera',
    imageUrl: '/demo/camera.jpg',
    listedPrice: usd(5500),
    status: 'listed',
    views: 0,
    listedAt: '2025-06-11',
  },
];
