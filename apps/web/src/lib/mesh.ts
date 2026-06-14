// Amazon Mesh "engine" (demo). Glass-box on purpose: rental rate, platform fee,
// and rent-vs-buy savings are deterministic arithmetic over the item's new price,
// so every number on screen is explainable and reproducible. Bookings persist to
// localStorage per user, and earnings flow into the existing EcoCredits ledger so
// Mesh income shows up alongside resale earnings in Rewards.
//
// In a later phase the dormancy + demand signals come from purchase-history and
// neighborhood-demand models; the contracts in @reloop/shared stay the same.

import type { MeshBooking, Money } from '@reloop/shared';
import { nsKey, readJson, writeJson } from './storage';
import { earnFor } from './credits-store';

const inr = (paise: number): Money => ({ amountCents: paise, currency: 'INR' });

/** Amazon's platform fee on a Mesh rental — pure margin on a zero-inventory deal. */
export const PLATFORM_FEE_RATE = 0.15;

/** Suggested daily rental as a share of the item's new price (~3%/day). */
const DAILY_RATE_FACTOR = 0.03;

/** Glass-box suggested daily rate: ~3% of new price, rounded to a clean ₹10. */
export function suggestDailyRate(newPrice: Money): Money {
  const raw = newPrice.amountCents * DAILY_RATE_FACTOR;
  return inr(Math.round(raw / 1000) * 1000);
}

/** Metres → human distance: "800 m" under 1 km, "1.5 km" above. */
export function formatDistance(metres: number): string {
  return metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
}

/** A fully-priced rental, derived from a daily rate, deposit, new price, and days. */
export interface MeshQuote {
  days: number;
  dailyRate: Money;
  /** dailyRate × days. */
  total: Money;
  deposit: Money;
  /** Amazon's cut of the total. */
  platformFee: Money;
  /** What the lender nets (total − fee). */
  lenderNet: Money;
  newPrice: Money;
  /** What the borrower saves vs buying new. */
  savedVsNew: Money;
  /** savedVsNew as a percentage of the new price. */
  savedPct: number;
}

/** Deterministic rental math — the single place fees and savings are computed. */
export function quote(
  dailyRate: Money,
  deposit: Money,
  newPrice: Money,
  days: number,
): MeshQuote {
  const total = inr(dailyRate.amountCents * days);
  const platformFee = inr(Math.round(total.amountCents * PLATFORM_FEE_RATE));
  const lenderNet = inr(total.amountCents - platformFee.amountCents);
  const savedVsNew = inr(Math.max(0, newPrice.amountCents - total.amountCents));
  const savedPct =
    newPrice.amountCents > 0
      ? Math.round((savedVsNew.amountCents / newPrice.amountCents) * 100)
      : 0;
  return { days, dailyRate, total, deposit, platformFee, lenderNet, newPrice, savedVsNew, savedPct };
}

// --- Booking store (per-user, localStorage) --------------------------------

const BOOKINGS_BASE = 'mesh.bookings';

/** Mesh transactions for the signed-in user, newest first. */
export function getBookings(): MeshBooking[] {
  return readJson<MeshBooking[]>(nsKey(BOOKINGS_BASE), []);
}

/** EcoCredits awarded for a Mesh transaction — modest, scaled to the value moved. */
function meshCredits(total: Money): number {
  return Math.max(2, Math.round(total.amountCents / 100 / 25));
}

/**
 * Record a confirmed lend/borrow for the signed-in user and post the matching
 * EcoCredits to their Rewards ledger (lenders earn on the payout; borrowers earn
 * for choosing circular, mirroring how buying second-life already earns credits).
 */
export function recordBooking(b: Omit<MeshBooking, 'id' | 'at'>): MeshBooking {
  const booking: MeshBooking = { ...b, id: `mesh_${Date.now()}`, at: new Date().toISOString() };
  writeJson(nsKey(BOOKINGS_BASE), [booking, ...getBookings()]);
  const verb = b.role === 'lend' ? 'Lent' : 'Borrowed';
  earnFor(undefined, meshCredits(b.total), `${verb} ${b.title} · Mesh`);
  return booking;
}

/** Has the signed-in user already booked this title in this role? (idempotent UI). */
export function hasBooking(title: string, role: MeshBooking['role']): boolean {
  return getBookings().some((b) => b.title === title && b.role === role);
}
