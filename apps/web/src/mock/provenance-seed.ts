// Seed provenance chains for the demo. Only the STAGED multi-life item is seeded
// richly — it already went Amazon → Aarav → Meera before the demo even starts, so
// its Health Card History shows TWO lives on first view. Every other item falls
// back to a generated single-life chain (see provenance-store.deriveChainFromCard).

import type { ItemId, Money, ProvenanceChain } from '@reloop/shared';

const inr = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

// The physical item at the heart of the flagship demo. Owned by Meera now (she
// bought it from Aarav through ReLoop); she re-lists it live on stage, appending
// a second life to this very chain.
export const STAGED_ITEM_ID: ItemId = 'itm_ultraboost';

/** When Meera took possession — also the staged owned item's purchaseDate. */
export const STAGED_ACQUIRED_AT = '2026-04-22T11:20:00.000Z';

const stagedChain: ProvenanceChain = {
  itemId: STAGED_ITEM_ID,
  category: 'sports',
  title: 'Adidas Ultraboost Light',
  events: [
    {
      type: 'origin',
      at: '2023-08-15T08:00:00.000Z',
      verified: true,
      seller: 'Amazon',
    },
    {
      type: 'owned',
      at: '2023-08-17T18:30:00.000Z',
      verified: true,
      ownerName: 'Aarav Shah',
    },
    {
      type: 'graded',
      at: '2026-04-10T09:00:00.000Z',
      verified: true,
      grade: 'like-new',
      confidence: 0.94,
      issues: ['Faint outsole wear'],
      referenceMatch: true,
    },
    {
      type: 'listed',
      at: '2026-04-10T09:02:00.000Z',
      verified: true,
      price: inr(320000), // ₹3,200
    },
    {
      type: 'sold',
      at: STAGED_ACQUIRED_AT,
      verified: true,
      buyerName: 'Meera Iyer',
      price: inr(320000), // ₹3,200
      co2SavedKg: 6, // estimateBuyerImpact(sports, ...)
      ecoCredits: 28,
    },
    {
      type: 'owned',
      at: STAGED_ACQUIRED_AT,
      verified: true,
      ownerName: 'Meera Iyer',
    },
  ],
};

export const PROVENANCE_SEEDS: Record<ItemId, ProvenanceChain> = {
  [STAGED_ITEM_ID]: stagedChain,
};

export function seedChainFor(itemId: ItemId): ProvenanceChain | undefined {
  const seed = PROVENANCE_SEEDS[itemId];
  // Deep clone so callers can't mutate the module-level seed.
  return seed ? structuredClone(seed) : undefined;
}
