# Spec 010 — Health Card History: persistent, multi-owner provenance chain

## Goal
Make the Product Health Card travel with the **physical item**, not the listing.
An item is "born" when Amazon first sells it and accumulates a verifiable,
append-only chain every time it is owned, graded, listed, repriced, sold, or
routed. When a buyer later re-lists something they bought, the system recognises
it as the **same item** and *appends* a new life to the existing chain instead of
starting a fresh card. The payoff is a "CARFAX for a product" lineage —
provenance you can trust — which is a moat only Amazon can show because only
Amazon owns the item's identity from first sale.

This is the trust pillar made deep: not a current snapshot, but everything the
object has ever been through, each step Amazon-verified.

## Scope

### In scope
- A stable **item identity** (`itemId`) in `packages/shared`, distinct from a
  listing and from an owner.
- A typed, append-only **provenance chain** (`ProvenanceEvent[]`) attached to the
  item identity, with past grades preserved (a re-grade never overwrites an
  earlier one).
- A **global** localStorage provenance store keyed by `itemId`, so the chain
  travels across users (like the existing global `reloop.market.sold`).
- Wiring identity through **buy → own → re-list** so a second life appends to the
  same chain:
  - on purchase: append an ownership-transfer event **and** create a buyer-side
    owned item carrying the same `itemId`;
  - on re-list of that item: append `listed` (and later `sold`) to the same chain.
- A **"This item's lives" History view** on the Product Health Card, surfaced on
  Shop item detail and the My Listings / sold panels — a clean visual lineage,
  not an audit dump.
- **Cumulative impact** across the whole life (CO₂ avoided + EcoCredits), derived
  by summing the existing `impact.ts` math over transaction events — nothing
  invented.
- **Demo seeding**: one dedicated item pre-staged as already sold Aarav → Meera
  with a populated chain, sitting in Meera's Resell so History is rich on first
  view and she can re-list it live to append a second life on stage.

### Out of scope
- Real blockchain / cryptographic verification. "Amazon-verified" is presented as
  trustworthy via the platform; we do **not** build crypto. (A `verified: true`
  flag per event is the visual stamp, nothing more.)
- New payment, real auth, real backend. Everything stays mock + localStorage.
- Changing the existing per-life `card.history` timeline, the Listing Agent arcs,
  the pegasus Shop storyline, or the grading/pricing pipeline.
- Retroactively giving every catalog item a deep multi-life history — only the
  staged demo item gets a seeded prior life; others start their chain at origin.

## Resolved decisions (from chat)
1. **Identity model — lightweight `itemId` + global chain store.** Add `itemId` to
   the shared contracts; the existing owned/shop ids become the canonical physical
   identity (no separate normalized registry). Chain lives in one global
   localStorage store keyed by `itemId`.
2. **Re-list path — live + one seed.** On purchase we append an ownership-transfer
   event and write a buyer-side owned item with the same `itemId`, so it appears
   in My Items → Resell and the sell flow appends a new life. Plus one pre-seeded
   already-sold item for first-view richness.
3. **Chain vs card — new History view, keep the mini-timeline.** The multi-owner
   lineage is a new, separate "This item's lives" view; the card's existing
   per-life `{label, at}` timeline is left exactly as-is (lowest regression risk).
4. **Demo item — dedicated staged item.** A purpose-built item (not the hero
   pegasus) is staged as already sold Aarav → Meera, keeping the existing
   pegasus/agent/sell arcs untouched.

## Data contracts (`packages/shared`)

### New: item identity + provenance (`packages/shared/src/provenance.ts`)
```ts
import type { ConditionGrade, ID, Money } from './common.js';
import type { ItemCategory } from './sell.js';

/** The stable physical object. Born at first Amazon sale; outlives any listing
 *  or owner. Listings, owned items, purchases and health cards reference this. */
export type ItemId = ID;

export type ProvenanceEventType =
  | 'origin'          // first sold by Amazon
  | 'owned'           // an owner takes possession (Amazon buyer, or a resale buyer)
  | 'graded'          // AI grade captured at a moment (snapshot preserved forever)
  | 'listed'          // put up for a second life at a price
  | 'price_adjusted'  // summarised agent reprice (NOT one event per tick)
  | 'sold'            // changed hands to the next owner at a price
  | 'routed';         // terminal: donate / recycle

/** Discriminated union — each event carries the verified data as it was THEN. */
export type ProvenanceEvent =
  | { type: 'origin'; at: string; verified: boolean; seller: string }            // "Sold new by Amazon"
  | { type: 'owned'; at: string; verified: boolean; ownerName: string }
  | { type: 'graded'; at: string; verified: boolean;
      grade: ConditionGrade; confidence: number; issues: string[];
      /** result of the reference-listing comparison at grade time, if any. */
      referenceMatch?: boolean }
  | { type: 'listed'; at: string; verified: boolean; price: Money }
  | { type: 'price_adjusted'; at: string; verified: boolean;
      fromPrice: Money; toPrice: Money; reason: string }
  | { type: 'sold'; at: string; verified: boolean;
      buyerName: string; price: Money;
      /** carbon + credits earned on THIS handoff (from impact.ts). */
      co2SavedKg: number; ecoCredits: number }
  | { type: 'routed'; at: string; verified: boolean;
      route: 'donate' | 'recycle'; co2SavedKg: number; ecoCredits: number };

/** The full lineage of one physical item. Append-only, chronological. */
export interface ProvenanceChain {
  itemId: ItemId;
  category: ItemCategory;
  title: string;
  events: ProvenanceEvent[]; // oldest → newest
}

/** Derived, never stored — computed from the chain by summing impact events. */
export interface CumulativeImpact {
  lives: number;            // count of distinct owners after origin
  co2SavedKg: number;       // Σ over sold + routed events
  ecoCredits: number;       // Σ over sold + routed events
  totalKept: Money;         // Σ resale value kept in circulation
}
```

### Changed: link the card to the item (`packages/shared/src/health-card.ts`)
- Add one field to `ProductHealthCard`:
  ```ts
  /** The physical item this card describes — the key into its provenance chain. */
  itemId: ItemId;
  ```
- `HealthCardEvent` and the existing `history` field are **unchanged** (the
  per-life mini-timeline stays).

### Changed: carry identity on the spine types
- `OwnedItem` (`owned-item.ts`): add `itemId: ItemId`.
- `ShopItem` (`shop.ts`): no new field — it reads `card.itemId`.
- `index.ts`: export the new `provenance.ts` symbols.

### New pure helper (`packages/shared/src/provenance.ts`)
```ts
/** Deterministic roll-up. No new magic numbers — sums values already on events. */
export function cumulativeImpact(chain: ProvenanceChain): CumulativeImpact;
```
Glass-box: it only adds up `co2SavedKg` / `ecoCredits` / price already stamped on
`sold` and `routed` events (those were produced by `impact.ts` at event time).
`lives` = number of `owned` events after the first.

## How identity persists through buy → own → re-list

**Today:** id spaces are conflated (`OwnedItem.id`, listing id, `card.productId`)
and a purchase never becomes a re-listable owned item. This spec threads one
`itemId` through all of it.

1. **Origin / seed.** Every owned item and every catalog listing is assigned a
   stable `itemId`. For existing items the `itemId` is derived from their current
   id (e.g. `own_*` / `shop_*`), so nothing else has to change. The chain for an
   item starts with an `origin` event (+ the current owner's `owned` event), seeded
   in a provenance mock (see below) or created lazily on first write.

2. **List.** When a user lists an item (sell flow, `sell-session.tsx`), the new
   listing's `card.itemId` is the source owned item's `itemId`, and a `graded` +
   `listed` event is appended to that item's chain.

3. **Buy.** On purchase (`marketplace-store.buyItem`), in addition to today's
   global-sold + per-user-purchase writes, we:
   - append a `sold` event (buyer name + price + that handoff's CO₂/credits) to the
     item's chain, then an `owned` event for the buyer;
   - write a **buyer-side owned item** (same `itemId`, buyer as `ownerId`,
     `returnEligible: false`) into a new per-user "acquired items" store so it shows
     in the buyer's My Items → Resell.

4. **Re-list (the appended second life).** The buyer opens that acquired item in
   the sell flow. Because it carries the original `itemId`, grading + listing append
   to the **same** chain — History now shows two lives. A later sale appends again.

5. **Route.** If a return/resell is routed to donate/recycle, a terminal `routed`
   event is appended (closes the chain).

**Persistence map (localStorage):**
- `reloop.provenance` — **global** map `{ [itemId]: ProvenanceChain }`. Travels
  across users, like `reloop.market.sold`. Read/written via a new
  `lib/provenance-store.ts` (append-only helpers; never mutate past events).
- `reloop.<accountId>.acquired` — **per-user** buyer-acquired owned items (the
  buy → own bridge), read by My Items alongside the static `ownedItems`.
- Existing stores (`reloop.market.sold`, `…purchases`, `reloop.listings`,
  `reloop.seller.sales`, `reloop.agent.*`) are unchanged; provenance is additive.

## Affected files

**`packages/shared/`**
- `src/provenance.ts` — **new**: `ItemId`, `ProvenanceEvent(Type)`,
  `ProvenanceChain`, `CumulativeImpact`, `cumulativeImpact()`.
- `src/health-card.ts` — add `itemId` to `ProductHealthCard`.
- `src/owned-item.ts` — add `itemId` to `OwnedItem`.
- `src/index.ts` — export provenance symbols.

**`apps/web/src/lib/`**
- `provenance-store.ts` — **new**: global chain store (`getChain`, `appendEvent`,
  `ensureChain`, append-only guarantees) + `lib/acquired-store.ts` (or one file)
  for per-user buyer-acquired items.
- `marketplace-store.ts` — `buyItem` also appends `sold` + `owned` events and
  writes the buyer-acquired item.
- `agent-store.ts` — when the agent makes a notable reprice, append a single
  summarised `price_adjusted` event (debounced/summary, not per tick).

**`apps/web/src/mock/`**
- `provenance-seed.ts` — **new**: seed chains, including the dedicated staged item
  already sold Aarav → Meera (full prior life) and lightweight `origin`+`owned`
  chains for the other real-user catalog items.
- `owned-items.ts` — assign `itemId` to each; add the staged item to Meera as an
  acquired/resell item with a prior life.
- `shop-items.ts`, `seed-listings.ts`, `casual-listings.ts` — thread `itemId` onto
  built cards (via `buildCard` / `listingFromShop`).

**`apps/web/src/components/`**
- `sell/health-card-history.tsx` — **new**: the "This item's lives" lineage view
  (gold-rail timeline, per-handoff verified stamp, cumulative-impact header).
- `sell/health-card.tsx` — add a "History / This item's lives" affordance that
  reveals/links the new view (mini-timeline stays).
- `shop/shop-detail.tsx` — render the History view for the item being bought.
- My Listings / sold panels (`app/listings`, sell `confirmed-step.tsx`) — surface
  History on the seller side too.
- `sell/sell-session.tsx` — append `graded` + `listed` events on confirm; pass the
  source item's `itemId` onto the new listing's card.

## UI / behaviour — the History view (provenance, not an audit dump)

**Placement:** a "This item's lives" section on the Product Health Card, shown on
(a) Shop item detail (`shop-detail.tsx`), and (b) the listing/sold panels. The
existing per-life timeline stays as the card's "this life" micro-history; this new
view is the macro lineage.

**Header — cumulative beat:**
> ♻ **N lives** · **X kg CO₂ avoided** · **Y EcoCredits earned across its life**

derived from `cumulativeImpact(chain)`. This compounds the existing
per-transaction math — derived, not invented.

**Lineage — reuse the gold-rail timeline language** (`health-card.tsx` rail):
each event a node on a vertical gold rail, grouped by ownership life, e.g.
```
●  Sold new by Amazon · 12 Jan 2024            ✓ Amazon-verified
│  Owned by Aarav Shah · ~14 months
●  Graded — Like New · 94% · "faint toe crease"  ✓ verified
●  Listed for a second life · ₹3,999            ✓
●  Sold to Meera Iyer · ₹3,500 · +6 kg CO₂       ✓
│  Owned by Meera Iyer · current
●  Graded — Good · 88% (re-graded; prior grade kept)  ✓
●  Listed again · ₹2,800                         ✓   ← appended live in demo
```
- Past grades are **preserved** and labelled (both grades visible in the chain).
- Each entry carries a **✓ verified** stamp (platform-verified, not crypto).
- **Honest about gaps:** if the chain has no events between two points, show a muted
  "No verified activity in this period" rather than fabricating one.

**Emotional landing:** the copy frames it as "see everything this object has ever
been through — each step Amazon-verified."

## Demo seeding & payoff
- **Staged item (dedicated):** a purpose-built item — e.g. *"Nike Air Jordan 1"*-
  class sneaker or a clean electronics item — with `itemId` carrying a full prior
  life seeded in `provenance-seed.ts`: `origin` (Amazon) → `owned` (Aarav) →
  `graded` (Like-New) → `listed` → `sold` (to Meera) → `owned` (Meera). It sits in
  **Meera's** My Items → Resell as an acquired item.
- **First view:** opening that item's Health Card already shows **2 lives** and a
  populated cumulative-impact header — impressive with zero clicks.
- **Live appended life:** on stage, Meera runs the sell flow on it → grading
  appends a second `graded` (her grade, Aarav's preserved) + `listed`; the History
  view now shows the new entry appended to the same chain. If another user buys it,
  a third `sold`/`owned` pair appends and lives → 3.

## Cumulative-impact calc (deterministic, derived)
- `co2SavedKg` = Σ `co2SavedKg` over `sold` + `routed` events.
- `ecoCredits` = Σ `ecoCredits` over `sold` + `routed` events.
- `totalKept` = Σ `price` over `sold` events.
- `lives` = count of `owned` events after the first.
- Each event's `co2SavedKg`/`ecoCredits` were produced by `impact.ts`
  (`estimateBuyerImpact` / `estimateRouteImpact`) at the moment it happened, so the
  roll-up introduces **no new numbers** — it only adds existing ones.

## Acceptance criteria
1. `packages/shared` builds with `itemId` on `ProductHealthCard` + `OwnedItem`, the
   new `provenance.ts` contracts, and `cumulativeImpact()` — strict TS, no `any`.
2. A global `reloop.provenance` store holds append-only chains keyed by `itemId`;
   appending an event never mutates or removes a prior event (verified by a re-grade
   leaving the earlier `graded` event intact in the chain).
3. The staged demo item shows a populated multi-life History (≥2 lives) on first
   view, on both Shop detail and the seller-side panel, with a cumulative-impact
   header whose numbers equal the sum of the chain's event values.
4. Buying any user-listed item appends a `sold` + `owned` pair to that item's chain
   and creates a buyer-side acquired item visible in the buyer's My Items → Resell.
5. Re-listing an acquired item appends `graded` + `listed` to the **same** chain
   (same `itemId`) — History shows the new life, prior grades preserved.
6. The History view uses the gold-rail timeline language, shows a ✓ verified stamp
   per entry, is honest about gaps, and reads as a lineage (not a log dump).
7. No regression to the pegasus Shop listing, the Listing Agent arcs, grading,
   pricing, or the existing per-life `card.history` timeline.

## Open questions
None blocking — the four forks are resolved above. Minor calls to settle in build
(non-blocking): exact staged-item product + photo, and the precise threshold for
when an agent reprice is "notable" enough to emit a summarised `price_adjusted`
event (default: only when the listed price actually changes, one event per change).

## As-shipped notes (build)
- **Staged item:** "Adidas Ultraboost Light" (`/catalog/ultraboost.jpg`), itemId
  `itm_ultraboost`, owned item `own_meera_ultraboost` in Meera's Resell. Seed chain
  Amazon → Aarav (owned) → graded like-new → listed ₹3,200 → sold to Meera ₹3,200
  (+6 kg CO₂, +28 EcoCredits) → owned Meera. Re-listing appends graded + listed.
- **`price_adjusted`:** one event per *actual* price change (tick reprice + manual
  override), appended only if the item already has a stored chain
  (`appendEventIfStored`) so the agent never fabricates a chain.
- **`lives` semantics:** number of distinct owners (≥1). The staged item shows
  **2 lives** on first view; a first-ever listing shows 1.
- **New files:** `packages/shared/src/provenance.ts`,
  `apps/web/src/lib/provenance-store.ts`, `apps/web/src/lib/acquired-store.ts`,
  `apps/web/src/mock/provenance-seed.ts`,
  `apps/web/src/components/sell/health-card-history.tsx`.
- **History surfaced on:** Shop item detail, the sell Confirmed step, and the My
  Listings detail panel (when the listing carries a card).
- **Sell route** (`/app/sell/[itemId]`) is now a client component so it resolves
  both static order-history items and buyer-acquired items.
- Verified: `@reloop/shared`, `@reloop/api`, and `web` typecheck clean; web
  production build succeeds.
