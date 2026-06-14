// Provenance — the multi-owner Health Card History ("CARFAX for a product").
// The Product Health Card travels with the PHYSICAL item, not the listing. An
// item is "born" at first Amazon sale and accumulates an append-only chain of
// verified events across every owner, grade, listing, reprice, sale, and route.
// Past grades are preserved — a re-grade APPENDS, it never overwrites.

import type { ConditionGrade, ID, Money } from './common.js';
import type { ItemCategory } from './sell.js';

/** The stable physical object. Born at first Amazon sale; outlives any listing
 *  or owner. Listings, owned items, purchases and health cards reference this. */
export type ItemId = ID;

export type ProvenanceEventType =
  | 'origin' // first sold by Amazon
  | 'owned' // an owner takes possession (Amazon buyer, or a resale buyer)
  | 'graded' // AI grade captured at a moment (snapshot preserved forever)
  | 'listed' // put up for a second life at a price
  | 'price_adjusted' // summarised agent reprice (NOT one event per tick)
  | 'sold' // changed hands to the next owner at a price
  | 'routed'; // terminal: donate / recycle

/** Discriminated union — each event carries the verified data as it was THEN. */
export type ProvenanceEvent =
  | { type: 'origin'; at: string; verified: boolean; seller: string }
  | { type: 'owned'; at: string; verified: boolean; ownerName: string }
  | {
      type: 'graded';
      at: string;
      verified: boolean;
      grade: ConditionGrade;
      confidence: number;
      issues: string[];
      /** Result of the reference-listing comparison at grade time, if any. */
      referenceMatch?: boolean;
    }
  | { type: 'listed'; at: string; verified: boolean; price: Money }
  | {
      type: 'price_adjusted';
      at: string;
      verified: boolean;
      fromPrice: Money;
      toPrice: Money;
      reason: string;
    }
  | {
      type: 'sold';
      at: string;
      verified: boolean;
      buyerName: string;
      price: Money;
      /** Carbon + credits earned on THIS handoff (from impact.ts). */
      co2SavedKg: number;
      ecoCredits: number;
    }
  | {
      type: 'routed';
      at: string;
      verified: boolean;
      route: 'donate' | 'recycle';
      co2SavedKg: number;
      ecoCredits: number;
    };

/** The full lineage of one physical item. Append-only, chronological (old→new). */
export interface ProvenanceChain {
  itemId: ItemId;
  category: ItemCategory;
  title: string;
  events: ProvenanceEvent[];
}

/** Derived, never stored — computed from the chain by summing impact events. */
export interface CumulativeImpact {
  /** Number of lives = number of distinct owners the item has had (≥1). */
  lives: number;
  /** Σ co2SavedKg over sold + routed events. */
  co2SavedKg: number;
  /** Σ ecoCredits over sold + routed events. */
  ecoCredits: number;
  /** Σ resale value kept in circulation (over sold events). */
  totalKept: Money;
}

/**
 * Deterministic roll-up of a chain's impact. Introduces NO new numbers — it only
 * sums values that impact.ts already stamped onto `sold` / `routed` events at the
 * moment they happened. `lives` = the number of owners (each owner is one life).
 */
export function cumulativeImpact(chain: ProvenanceChain): CumulativeImpact {
  let co2SavedKg = 0;
  let ecoCredits = 0;
  let totalKeptCents = 0;
  let owners = 0;

  for (const e of chain.events) {
    if (e.type === 'owned') owners += 1;
    if (e.type === 'sold') {
      co2SavedKg += e.co2SavedKg;
      ecoCredits += e.ecoCredits;
      totalKeptCents += e.price.amountCents;
    }
    if (e.type === 'routed') {
      co2SavedKg += e.co2SavedKg;
      ecoCredits += e.ecoCredits;
    }
  }

  return {
    lives: Math.max(1, owners),
    co2SavedKg,
    ecoCredits,
    totalKept: { amountCents: totalKeptCents, currency: 'INR' },
  };
}
