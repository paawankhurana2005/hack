// Amazon Mesh neighborhood (demo, mock). Two halves:
//
//  • Dormant inventory — for the signed-in user, the things they bought but haven't
//    touched in months, each matched to live nearby demand. This is the proactive
//    nudge: "your DSLR has sat idle 6 months, a neighbor 800m away wants it."
//  • Borrowable listings — a shared pool of nearby items the user can rent for a
//    fraction of buying new, every one a classic "temporary need" (a camera for a
//    weekend, a console for the holidays, a pressure cooker for a dinner party).
//
// Reuses existing /catalog images — no new assets. Rates are curated to read like
// clean numbers but stay in line with the glass-box engine (~3%/day of new price).

import type { DormantSignal, MeshListing, Money } from '@reloop/shared';

const inr = (paise: number): Money => ({ amountCents: paise, currency: 'INR' });

// --- Dormant inventory, per signed-in user ---------------------------------
// The hero is Aarav's idle DSLR — 6 months untouched, a neighbor 800m away wants
// it this weekend for ₹600 (the exact pitch from the Mesh brief).
const DORMANT: Record<string, DormantSignal[]> = {
  user_aarav: [
    {
      id: 'dorm_aarav_camera',
      title: 'Canon EOS R50 Mirrorless Camera',
      category: 'electronics',
      imageUrl: '/catalog/canon-camera.jpg',
      newPrice: inr(6499900), // ₹64,999
      idleMonths: 6,
      suggestedDailyRate: inr(60000), // ₹600/day
      deposit: inr(1000000), // ₹10,000
      projectedMonthlyEarn: inr(360000), // ₹3,600
      demand: [
        { borrowerName: 'Nikhil', distanceM: 800, purpose: 'A weekend wedding shoot', days: 2 },
        { borrowerName: 'Priya', distanceM: 1500, purpose: 'A travel vlog', days: 3 },
      ],
    },
    {
      id: 'dorm_aarav_ps5',
      title: 'Sony PlayStation 5',
      category: 'electronics',
      imageUrl: '/catalog/ps5.jpg',
      newPrice: inr(5499900), // ₹54,999
      idleMonths: 4,
      suggestedDailyRate: inr(50000), // ₹500/day
      deposit: inr(800000), // ₹8,000
      projectedMonthlyEarn: inr(400000), // ₹4,000
      demand: [
        { borrowerName: 'Karan', distanceM: 1200, purpose: 'A long weekend of gaming', days: 4 },
      ],
    },
  ],
  user_meera: [
    {
      id: 'dorm_meera_instantpot',
      title: 'Instant Pot Duo 6L',
      category: 'home',
      imageUrl: '/catalog/instant-pot.jpg',
      newPrice: inr(899900), // ₹8,999
      idleMonths: 8,
      suggestedDailyRate: inr(30000), // ₹300/day
      deposit: inr(200000), // ₹2,000
      projectedMonthlyEarn: inr(180000), // ₹1,800
      demand: [
        { borrowerName: 'Sana', distanceM: 600, purpose: 'A festival dinner for 20', days: 3 },
      ],
    },
  ],
  user_rohan: [
    {
      id: 'dorm_rohan_tv',
      title: 'Samsung 55" 4K Smart TV',
      category: 'electronics',
      imageUrl: '/catalog/samsung-tv.jpg',
      newPrice: inr(4999900), // ₹49,999
      idleMonths: 5,
      suggestedDailyRate: inr(50000), // ₹500/day
      deposit: inr(700000), // ₹7,000
      projectedMonthlyEarn: inr(300000), // ₹3,000
      demand: [
        { borrowerName: 'Devika', distanceM: 950, purpose: 'A World Cup watch party', days: 2 },
      ],
    },
  ],
  user_ananya: [
    {
      id: 'dorm_ananya_speaker',
      title: 'JBL PartyBox Speaker',
      category: 'electronics',
      imageUrl: '/catalog/jbl-speaker.jpg',
      newPrice: inr(2499900), // ₹24,999
      idleMonths: 7,
      suggestedDailyRate: inr(40000), // ₹400/day
      deposit: inr(400000), // ₹4,000
      projectedMonthlyEarn: inr(240000), // ₹2,400
      demand: [
        { borrowerName: 'Aditya', distanceM: 700, purpose: 'A rooftop birthday party', days: 2 },
      ],
    },
  ],
};

export function getDormantItems(accountId: string): DormantSignal[] {
  return DORMANT[accountId] ?? [];
}

export function findDormantItem(id: string): DormantSignal | undefined {
  return Object.values(DORMANT)
    .flat()
    .find((d) => d.id === id);
}

// --- Borrowable listings (shared neighborhood pool) ------------------------
const LISTINGS: MeshListing[] = [
  {
    id: 'mesh_dslr',
    title: 'Canon EOS R10 Mirrorless Camera',
    category: 'electronics',
    imageUrl: '/catalog/canon-camera.jpg',
    blurb: 'Pristine mirrorless body with kit lens. Perfect for a weekend shoot before you commit to buying.',
    lenderName: 'Ishaan',
    lenderInitials: 'IK',
    distanceM: 650,
    dailyRate: inr(55000), // ₹550/day
    deposit: inr(900000), // ₹9,000
    newPrice: inr(5499900), // ₹54,999
    rating: 4.9,
    lentCount: 12,
    availability: 'Free this weekend',
  },
  {
    id: 'mesh_ps5',
    title: 'Sony PlayStation 5',
    category: 'electronics',
    imageUrl: '/catalog/ps5.jpg',
    blurb: 'Disc edition with two controllers. Great for a holiday weekend with friends.',
    lenderName: 'Rhea',
    lenderInitials: 'RS',
    distanceM: 1100,
    dailyRate: inr(50000), // ₹500/day
    deposit: inr(800000), // ₹8,000
    newPrice: inr(5499900),
    rating: 4.8,
    lentCount: 23,
    availability: 'Available from Friday',
  },
  {
    id: 'mesh_instantpot',
    title: 'Instant Pot Duo 6L',
    category: 'home',
    imageUrl: '/catalog/instant-pot.jpg',
    blurb: 'Barely-used multi-cooker. Ideal for a one-off dinner party — skip buying one you’ll never use again.',
    lenderName: 'Meghna',
    lenderInitials: 'MG',
    distanceM: 400,
    dailyRate: inr(25000), // ₹250/day
    deposit: inr(150000), // ₹1,500
    newPrice: inr(899900),
    rating: 5.0,
    lentCount: 8,
    availability: 'Free this week',
  },
  {
    id: 'mesh_headphones',
    title: 'Sony WH-1000XM5 Headphones',
    category: 'electronics',
    imageUrl: '/catalog/sony-headphones.jpg',
    blurb: 'Noise-cancelling over-ears. Borrow for a long flight instead of buying a pair you’ll use twice a year.',
    lenderName: 'Tara',
    lenderInitials: 'TN',
    distanceM: 1800,
    dailyRate: inr(20000), // ₹200/day
    deposit: inr(250000), // ₹2,500
    newPrice: inr(2999900), // ₹29,999
    rating: 4.7,
    lentCount: 15,
    availability: 'Available now',
  },
  {
    id: 'mesh_tv',
    title: 'Samsung 55" 4K Smart TV',
    category: 'electronics',
    imageUrl: '/catalog/samsung-tv.jpg',
    blurb: 'Big-screen for a match night or movie marathon. Wall-mountable, comes with a stand.',
    lenderName: 'Devang',
    lenderInitials: 'DV',
    distanceM: 2100,
    dailyRate: inr(45000), // ₹450/day
    deposit: inr(600000), // ₹6,000
    newPrice: inr(4999900),
    rating: 4.6,
    lentCount: 6,
    availability: 'Free this weekend',
  },
  {
    id: 'mesh_speaker',
    title: 'JBL PartyBox Speaker',
    category: 'electronics',
    imageUrl: '/catalog/jbl-speaker.jpg',
    blurb: 'Loud, punchy party speaker with lights. Rent it for the night, not the year.',
    lenderName: 'Aliya',
    lenderInitials: 'AK',
    distanceM: 900,
    dailyRate: inr(35000), // ₹350/day
    deposit: inr(350000), // ₹3,500
    newPrice: inr(2499900),
    rating: 4.9,
    lentCount: 19,
    availability: 'Available from Saturday',
  },
];

export const meshListings: MeshListing[] = LISTINGS;

export function findMeshListing(id: string): MeshListing | undefined {
  return LISTINGS.find((l) => l.id === id);
}
