// The provenance chain store — the item's Health Card History. GLOBAL (like
// reloop.market.sold) so the chain travels with the physical item across owners.
// Append-only: appendEvent never mutates or drops a prior event, so past grades
// are preserved forever. Chains are keyed by the stable itemId.

import type {
  ItemCategory,
  ItemId,
  ProductHealthCard,
  ProvenanceChain,
  ProvenanceEvent,
} from '@reloop/shared';
import { readJson, writeJson } from './storage';
import { pushEvent } from './data-api';
import { seedChainFor } from '@/mock/provenance-seed';

const KEY = 'reloop.provenance'; // global: { [itemId]: ProvenanceChain }

type ChainMap = Record<ItemId, ProvenanceChain>;

function readAll(): ChainMap {
  return readJson<ChainMap>(KEY, {});
}

function writeChain(chain: ProvenanceChain): void {
  const all = readAll();
  all[chain.itemId] = chain;
  writeJson(KEY, all);
}

/** The stored chain for an item, or null if nothing has been written yet. */
export function getChain(itemId: ItemId): ProvenanceChain | null {
  return readAll()[itemId] ?? null;
}

/** Every stored provenance chain — the raw material for the training flywheel. */
export function getAllChains(): ProvenanceChain[] {
  return Object.values(readAll());
}

/** True if `event` duplicates the chain's most recent event (same type + at) — the
 *  signature of a retry / cold-start re-fire. Idempotency guard so we never append
 *  the same verified event twice. */
function isDuplicateOfLast(events: ProvenanceEvent[], event: ProvenanceEvent): boolean {
  const last = events[events.length - 1];
  return last != null && last.type === event.type && last.at === event.at;
}

/** Build a sensible single-life chain from a card when no chain exists yet:
 *  origin (Amazon) → owned (current seller) → graded → listed. Honest and minimal
 *  — every item really was sold new by Amazon and graded before listing. */
export function deriveChainFromCard(
  card: ProductHealthCard,
  opts: { category: ItemCategory; sellerName: string },
): ProvenanceChain {
  const events: ProvenanceEvent[] = [
    { type: 'origin', at: card.issuedAt, verified: true, seller: 'Amazon' },
    { type: 'owned', at: card.issuedAt, verified: true, ownerName: opts.sellerName },
    {
      type: 'graded',
      at: card.history.find((h) => h.label === 'Graded')?.at ?? card.issuedAt,
      verified: card.authenticityVerified,
      grade: card.grade,
      confidence: card.confidence,
      issues: card.detectedIssues,
    },
  ];
  if (card.listingPrice) {
    events.push({ type: 'listed', at: card.issuedAt, verified: true, price: card.listingPrice });
  }
  return { itemId: card.itemId, category: opts.category, title: card.title, events };
}

/** The pre-action chain for an item about to be listed for the FIRST time:
 *  origin (Amazon) → owned (current owner). The sell flow appends `graded` +
 *  `listed` on top of this, so no events are duplicated. Ignored when a richer
 *  chain already exists (e.g. a seeded multi-life item being re-listed). */
export function baseChain(
  itemId: ItemId,
  opts: { category: ItemCategory; title: string; ownerName: string; at: string },
): ProvenanceChain {
  return {
    itemId,
    category: opts.category,
    title: opts.title,
    events: [
      { type: 'origin', at: opts.at, verified: true, seller: 'Amazon' },
      { type: 'owned', at: opts.at, verified: true, ownerName: opts.ownerName },
    ],
  };
}

/** For the UI — the chain to render, with no side effects. Prefers the stored
 *  chain, then a rich seed, then a card-derived fallback. */
export function resolveChain(
  card: ProductHealthCard,
  opts: { category: ItemCategory; sellerName: string },
): ProvenanceChain {
  return getChain(card.itemId) ?? seedChainFor(card.itemId) ?? deriveChainFromCard(card, opts);
}

/** Ensure a chain exists in the store (hydrating the seed or a fallback), then
 *  return it — used right before an append so the new event lands on real history. */
function ensureStored(itemId: ItemId, fallback: ProvenanceChain): ProvenanceChain {
  const existing = getChain(itemId);
  if (existing) return existing;
  const base = seedChainFor(itemId) ?? fallback;
  writeChain(base);
  return base;
}

/** Append only if the item already has a stored chain — used by the Listing Agent
 *  so a background reprice never fabricates a chain out of thin air. */
export function appendEventIfStored(itemId: ItemId, event: ProvenanceEvent): void {
  const existing = getChain(itemId);
  if (!existing) return;
  if (isDuplicateOfLast(existing.events, event)) return; // idempotent: skip re-fire
  writeChain({ ...existing, events: [...existing.events, event] });
  pushEvent(itemId, event, { category: existing.category, title: existing.title }); // → DynamoDB
}

/**
 * Append one verified event to an item's chain (append-only). `fallback` seeds the
 * chain if it doesn't exist yet (e.g. derived from the card at first write).
 */
export function appendEvent(
  itemId: ItemId,
  event: ProvenanceEvent,
  fallback: ProvenanceChain,
): ProvenanceChain {
  const chain = ensureStored(itemId, fallback);
  if (isDuplicateOfLast(chain.events, event)) return chain; // idempotent: skip re-fire
  const next: ProvenanceChain = { ...chain, events: [...chain.events, event] };
  writeChain(next);
  pushEvent(itemId, event, { category: next.category, title: next.title }); // → DynamoDB
  return next;
}
