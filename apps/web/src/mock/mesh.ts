// Amazon Mesh neighborhood (demo, mock). Two halves:
//
//  • Dormant inventory — for the signed-in user, the things they bought but haven't
//    touched in months, each matched to live nearby demand. This is the proactive
//    nudge: "your DSLR has sat idle 6 months, a neighbor 800m away wants it."
//  • Borrowable listings — a shared pool of nearby items the user can rent for a
//    fraction of buying new, every one a classic "temporary need" (a camera for a
//    weekend, a drill for one job, a console for the holidays).
//
// Every image under /catalog is a real, exact-model product shot. Daily rates sit
// well below the item's new price, so the rent-vs-buy savings read true.

import type { DormantSignal, MeshListing, Money } from '@reloop/shared';

const inr = (paise: number): Money => ({ amountCents: paise, currency: 'INR' });

/** Category chip order for the borrow-side filter. */
export const meshGroups = ['Cameras', 'Gaming', 'Audio & TV', 'Home', 'Tools', 'Outdoors'] as const;

// --- Dormant inventory, per signed-in user ---------------------------------
// The hero is Aarav's idle camera — 6 months untouched, a neighbor 800m away wants
// it this weekend (the proactive pitch from the Mesh brief).
const DORMANT: Record<string, DormantSignal[]> = {
  user_aarav: [
    {
      id: 'dorm_aarav_camera',
      title: 'Canon EOS R5 Mirrorless Camera',
      category: 'electronics',
      imageUrl: '/catalog/canon-r5.jpg',
      newPrice: inr(32999500), // ₹3,29,995
      idleMonths: 6,
      suggestedDailyRate: inr(120000), // ₹1,200/day
      deposit: inr(1500000), // ₹15,000
      projectedMonthlyEarn: inr(720000), // ₹7,200
      demand: [
        { borrowerName: 'Nikhil', distanceM: 800, purpose: 'A weekend wedding shoot', days: 2 },
        { borrowerName: 'Priya', distanceM: 1500, purpose: 'A travel vlog', days: 3 },
      ],
    },
    {
      id: 'dorm_aarav_ps5',
      title: 'Sony PlayStation 5',
      category: 'electronics',
      imageUrl: '/catalog/ps5-console.png',
      newPrice: inr(5499000), // ₹54,990
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
      id: 'dorm_meera_cooker',
      title: 'Electric Pressure Cooker (6L)',
      category: 'home',
      imageUrl: '/catalog/pressure-cooker.jpg',
      newPrice: inr(899900), // ₹8,999
      idleMonths: 8,
      suggestedDailyRate: inr(12000), // ₹120/day
      deposit: inr(100000), // ₹1,000
      projectedMonthlyEarn: inr(180000), // ₹1,800
      demand: [
        { borrowerName: 'Sana', distanceM: 600, purpose: 'A festival dinner for 20', days: 3 },
      ],
    },
  ],
  user_rohan: [
    {
      id: 'dorm_rohan_tv',
      title: 'Samsung 55" Crystal 4K Smart TV',
      category: 'home',
      imageUrl: '/catalog/samsung-tv-led.jpg',
      newPrice: inr(5499000), // ₹54,990
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
      title: 'JBL Charge 5 Bluetooth Speaker',
      category: 'electronics',
      imageUrl: '/catalog/jbl-charge.jpg',
      newPrice: inr(1499900), // ₹14,999
      idleMonths: 7,
      suggestedDailyRate: inr(25000), // ₹250/day
      deposit: inr(200000), // ₹2,000
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
  // --- Cameras -------------------------------------------------------------
  {
    id: 'mesh_camera',
    title: 'Canon EOS R5 Mirrorless Camera',
    category: 'electronics',
    group: 'Cameras',
    imageUrl: '/catalog/canon-r5.jpg',
    blurb: 'Pro full-frame body with a 24-105mm lens. Perfect for a weekend shoot before you commit to buying.',
    lenderName: 'Ishaan',
    lenderInitials: 'IK',
    distanceM: 650,
    dailyRate: inr(120000), // ₹1,200/day
    deposit: inr(1500000), // ₹15,000
    newPrice: inr(32999500), // ₹3,29,995
    rating: 4.9,
    lentCount: 12,
    availability: 'Free this weekend',
  },
  {
    id: 'mesh_gopro',
    title: 'GoPro HERO12 Black',
    category: 'electronics',
    group: 'Cameras',
    imageUrl: '/catalog/gopro-hero.jpg',
    blurb: 'Rugged action cam with mounts and spare batteries. Grab it for a trek or a dive trip.',
    lenderName: 'Vivek',
    lenderInitials: 'VS',
    distanceM: 1400,
    dailyRate: inr(40000), // ₹400/day
    deposit: inr(500000), // ₹5,000
    newPrice: inr(4500000), // ₹45,000
    rating: 4.7,
    lentCount: 18,
    availability: 'Available now',
  },
  {
    id: 'mesh_drone',
    title: 'DJI Mavic 3 Pro Drone',
    category: 'electronics',
    group: 'Cameras',
    imageUrl: '/catalog/dji-mavic.jpg',
    blurb: 'Hasselblad-camera drone for stunning aerials. Ideal for a one-off event or a holiday.',
    lenderName: 'Rohit',
    lenderInitials: 'RM',
    distanceM: 2300,
    dailyRate: inr(90000), // ₹900/day
    deposit: inr(1000000), // ₹10,000
    newPrice: inr(12990000), // ₹1,29,900
    rating: 4.8,
    lentCount: 7,
    availability: 'Available from Friday',
  },

  // --- Gaming --------------------------------------------------------------
  {
    id: 'mesh_ps5',
    title: 'Sony PlayStation 5',
    category: 'electronics',
    group: 'Gaming',
    imageUrl: '/catalog/ps5-console.png',
    blurb: 'Disc edition with two DualSense controllers. Great for a holiday weekend with friends.',
    lenderName: 'Rhea',
    lenderInitials: 'RS',
    distanceM: 1100,
    dailyRate: inr(50000), // ₹500/day
    deposit: inr(800000), // ₹8,000
    newPrice: inr(5499000), // ₹54,990
    rating: 4.8,
    lentCount: 23,
    availability: 'Available from Friday',
  },
  {
    id: 'mesh_xbox',
    title: 'Xbox Series X Console',
    category: 'electronics',
    group: 'Gaming',
    imageUrl: '/catalog/xbox-series-x.jpg',
    blurb: 'Series X with Game Pass loaded and an extra controller. Try before you buy the ecosystem.',
    lenderName: 'Arjun',
    lenderInitials: 'AP',
    distanceM: 1700,
    dailyRate: inr(45000), // ₹450/day
    deposit: inr(700000), // ₹7,000
    newPrice: inr(5299000), // ₹52,990
    rating: 4.6,
    lentCount: 9,
    availability: 'Free this weekend',
  },
  {
    id: 'mesh_switch',
    title: 'Nintendo Switch OLED',
    category: 'electronics',
    group: 'Gaming',
    imageUrl: '/catalog/switch-oled.jpg',
    blurb: 'OLED handheld with a case and three party games. Perfect for a trip or a kids’ sleepover.',
    lenderName: 'Neha',
    lenderInitials: 'NK',
    distanceM: 500,
    dailyRate: inr(35000), // ₹350/day
    deposit: inr(500000), // ₹5,000
    newPrice: inr(3499900), // ₹34,999
    rating: 5.0,
    lentCount: 21,
    availability: 'Available now',
  },

  // --- Audio & TV ----------------------------------------------------------
  {
    id: 'mesh_speaker',
    title: 'JBL Charge 5 Party Speaker',
    category: 'electronics',
    group: 'Audio & TV',
    imageUrl: '/catalog/jbl-charge.jpg',
    blurb: 'Loud, punchy and waterproof. Rent it for the night, not the year.',
    lenderName: 'Aliya',
    lenderInitials: 'AK',
    distanceM: 900,
    dailyRate: inr(25000), // ₹250/day
    deposit: inr(200000), // ₹2,000
    newPrice: inr(1499900), // ₹14,999
    rating: 4.9,
    lentCount: 19,
    availability: 'Available from Saturday',
  },
  {
    id: 'mesh_headphones',
    title: 'Sony WH-1000XM5 Headphones',
    category: 'electronics',
    group: 'Audio & TV',
    imageUrl: '/catalog/sony-wh1000xm.jpg',
    blurb: 'Noise-cancelling over-ears for a long flight — skip buying a pair you’ll use twice a year.',
    lenderName: 'Tara',
    lenderInitials: 'TN',
    distanceM: 1800,
    dailyRate: inr(20000), // ₹200/day
    deposit: inr(300000), // ₹3,000
    newPrice: inr(2999000), // ₹29,990
    rating: 4.7,
    lentCount: 15,
    availability: 'Available now',
  },
  {
    id: 'mesh_tv',
    title: 'Samsung 55" Crystal 4K Smart TV',
    category: 'home',
    group: 'Audio & TV',
    imageUrl: '/catalog/samsung-tv-led.jpg',
    blurb: 'Big-screen for a match night or movie marathon. Comes with a stand, easy to set up.',
    lenderName: 'Devang',
    lenderInitials: 'DV',
    distanceM: 2100,
    dailyRate: inr(50000), // ₹500/day
    deposit: inr(700000), // ₹7,000
    newPrice: inr(5499000), // ₹54,990
    rating: 4.6,
    lentCount: 6,
    availability: 'Free this weekend',
  },

  // --- Home ----------------------------------------------------------------
  {
    id: 'mesh_projector',
    title: 'BenQ Full-HD Home Projector',
    category: 'electronics',
    group: 'Home',
    imageUrl: '/catalog/benq-projector.jpg',
    blurb: 'Turn any wall into a cinema. Great for a movie night or a one-off presentation.',
    lenderName: 'Kabir',
    lenderInitials: 'KB',
    distanceM: 1300,
    dailyRate: inr(45000), // ₹450/day
    deposit: inr(600000), // ₹6,000
    newPrice: inr(6499900), // ₹64,999
    rating: 4.7,
    lentCount: 11,
    availability: 'Available from Friday',
  },
  {
    id: 'mesh_nespresso',
    title: 'Nespresso Vertuo Coffee Machine',
    category: 'home',
    group: 'Home',
    imageUrl: '/catalog/nespresso.jpg',
    blurb: 'Café-quality coffee for a houseful of guests over a long weekend.',
    lenderName: 'Maya',
    lenderInitials: 'MR',
    distanceM: 750,
    dailyRate: inr(15000), // ₹150/day
    deposit: inr(150000), // ₹1,500
    newPrice: inr(1490000), // ₹14,900
    rating: 4.8,
    lentCount: 8,
    availability: 'Available now',
  },
  {
    id: 'mesh_vacuum',
    title: 'Dyson V10 Cordless Vacuum',
    category: 'home',
    group: 'Home',
    imageUrl: '/catalog/dyson-v10.jpg',
    blurb: 'Deep-clean before you move out or after a party, without buying one outright.',
    lenderName: 'Sneha',
    lenderInitials: 'SG',
    distanceM: 1000,
    dailyRate: inr(25000), // ₹250/day
    deposit: inr(400000), // ₹4,000
    newPrice: inr(3990000), // ₹39,900
    rating: 4.6,
    lentCount: 13,
    availability: 'Available now',
  },
  {
    id: 'mesh_cooker',
    title: 'Electric Pressure Cooker (6L)',
    category: 'home',
    group: 'Home',
    imageUrl: '/catalog/pressure-cooker.jpg',
    blurb: 'Barely-used multi-cooker — ideal for a one-off dinner party for a crowd.',
    lenderName: 'Meghna',
    lenderInitials: 'MG',
    distanceM: 400,
    dailyRate: inr(12000), // ₹120/day
    deposit: inr(100000), // ₹1,000
    newPrice: inr(899900), // ₹8,999
    rating: 5.0,
    lentCount: 10,
    availability: 'Free this week',
  },

  // --- Tools ---------------------------------------------------------------
  {
    id: 'mesh_drill',
    title: 'DeWalt 20V Cordless Drill',
    category: 'home',
    group: 'Tools',
    imageUrl: '/catalog/dewalt-drill.jpg',
    blurb: 'For that one job — hanging shelves or assembling furniture. Comes with a bit set and battery.',
    lenderName: 'Faisal',
    lenderInitials: 'FA',
    distanceM: 350,
    dailyRate: inr(15000), // ₹150/day
    deposit: inr(200000), // ₹2,000
    newPrice: inr(1299900), // ₹12,999
    rating: 4.9,
    lentCount: 27,
    availability: 'Available now',
  },

  // --- Outdoors ------------------------------------------------------------
  {
    id: 'mesh_tent',
    title: '4-Person Camping Tent',
    category: 'sports',
    group: 'Outdoors',
    imageUrl: '/catalog/camping-tent.jpg',
    blurb: 'Weatherproof dome tent for a weekend trek — no need to own gear you use once a year.',
    lenderName: 'Imran',
    lenderInitials: 'IS',
    distanceM: 1600,
    dailyRate: inr(20000), // ₹200/day
    deposit: inr(200000), // ₹2,000
    newPrice: inr(899900), // ₹8,999
    rating: 4.8,
    lentCount: 14,
    availability: 'Free this weekend',
  },
];

export const meshListings: MeshListing[] = LISTINGS;

export function findMeshListing(id: string): MeshListing | undefined {
  return LISTINGS.find((l) => l.id === id);
}
