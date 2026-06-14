// Amazon Mesh contracts — hyperlocal peer-to-peer lending.
// ReLoop activates the dormant inventory already sitting in customers' homes:
// instead of a "temporary need" purchase becoming a return that ships to a
// warehouse, a nearby neighbor borrows the thing that's already here. The owner
// earns passive income, the borrower pays a fraction of buying new, Amazon takes
// a platform fee — a return loop is eliminated with no new inventory.
//
// Types only — single source of truth in @reloop/shared. The rate/fee/savings
// math is glass-box and lives in apps/web/src/lib/mesh.ts.

import type { ID, Money } from './common.js';
import type { ItemCategory } from './sell.js';

/** A neighbor who wants to borrow a specific item nearby — the demand signal. */
export interface MeshDemand {
  borrowerName: string;
  /** Distance from the owner, in metres ("a neighbor 800m away"). */
  distanceM: number;
  /** What they want it for — the human reason behind the temporary need. */
  purpose: string;
  /** How many days they'd rent it. */
  days: number;
}

/**
 * A dormant item the owner already owns that Mesh proactively suggests lending.
 * Surfaced by scanning purchase history for things bought but untouched for months,
 * then matched against live neighborhood demand.
 */
export interface DormantSignal {
  id: ID;
  title: string;
  category: ItemCategory;
  imageUrl: string;
  /** What the item cost new — anchors the rental rate and the borrower's savings. */
  newPrice: Money;
  /** Months since the item was last used (the dormancy that triggers the nudge). */
  idleMonths: number;
  /** Suggested per-day rental price. */
  suggestedDailyRate: Money;
  /** Refundable deposit held for the duration of a loan. */
  deposit: Money;
  /** Nearby neighbors who want it right now — drives the nudge, top demand first. */
  demand: MeshDemand[];
  /** Estimated monthly passive income at local demand. */
  projectedMonthlyEarn: Money;
}

/** An item a neighbor has listed as available to borrow. */
export interface MeshListing {
  id: ID;
  title: string;
  category: ItemCategory;
  /** Display group for the borrow-side category filter (e.g. "Cameras", "Gaming"). */
  group: string;
  imageUrl: string;
  blurb: string;
  lenderName: string;
  lenderInitials: string;
  /** Distance from the borrower, in metres. */
  distanceM: number;
  dailyRate: Money;
  deposit: Money;
  /** What the same item costs new — drives the rent-vs-buy-new savings. */
  newPrice: Money;
  /** 0..5 lender rating. */
  rating: number;
  /** How many times this item has been lent on Mesh — trust signal. */
  lentCount: number;
  /** Human availability, e.g. "Free this weekend". */
  availability: string;
}

/** The role the signed-in user plays in a Mesh transaction. */
export type MeshRole = 'lend' | 'borrow';

/** A confirmed Mesh transaction (lend or borrow), recorded for the user. */
export interface MeshBooking {
  id: ID;
  role: MeshRole;
  title: string;
  imageUrl: string;
  /** The other party — the borrower (if lending) or the lender (if borrowing). */
  counterpartyName: string;
  days: number;
  dailyRate: Money;
  /** dailyRate × days. */
  total: Money;
  deposit: Money;
  /** Amazon's platform fee taken from the rental total — the margin on the deal. */
  platformFee: Money;
  /** What the lender actually nets (total − platform fee). */
  lenderNet: Money;
  at: string; // ISO 8601
}
