# 026 — Return flow overhaul: real economics, a deep Health Card, and seller route choice

## Goal

The Return flow is the product (spec 016's pivot), so it needs to read as a
real, technically serious system end to end. This iteration: fixes a real
unit bug in the seller-facing economics, gives the Return flow a Health Card
with the same depth as the Sell flow's showpiece card, documents why the
liquidation engine's per-item estimate intentionally doesn't call the full
bid-curve engine, gives the `donate` decision the dedicated explanation every
other decision already has, and — the headline capability — lets the
**seller** dispatch a returned item to any viable route from the full EV
breakdown, not just the AI's own recommendation.

**Correction during build**: the route-choice capability was first built on
the customer/buyer return-confirmation screen, on the (wrong) assumption that
"the person who chooses" was the person returning the item. It is not — the
returning customer has no reason to pick fulfillment logistics for their own
returned item, and real Amazon return policy doesn't offer that either. The
**seller** (the merchant who receives the return and decides what to do with
it — refurbish, resell locally, donate, warehouse, etc.) is who needs this
choice, and is who already had a narrower version of it (the old "Approve for
Local Listing / Send to Warehouse Instead" binary). This spec reflects the
corrected, shipped design: seller-side, not buyer-side.

## Scope

**In scope**
1. Fix `ReturnRoutingDecision.localMargin`/`warehouseMargin` unit mismatch on
   the seller return-detail page (rupees vs. cents — see Resolved decisions).
2. Fix a real data-masking bug: seeded demo returns' localStorage interaction
   overrides were replacing the *entire* record, permanently shadowing any
   source-code fix to their seed data.
3. Visual polish on `SellerReturnDetail.tsx`, and making the Product Health
   Card a real inline page section instead of hidden behind a click-to-open
   modal.
4. A deep, shared Product Health Card component for the Return flow (grade,
   confidence, authenticity, defects, trust score, plus a real lifecycle
   history timeline), replacing two separate thin/bespoke renderings.
5. Document (not rewrite) why `routing-ev.ts`'s per-item liquidate term
   doesn't call `liquidation-lot.ts`'s full bid-curve engine.
6. A `donate`-decision explanation block on the buyer return flow, surfacing
   the real (spec 015) EcoCredits voucher value.
7. **Seller route choice**: on the seller return-detail page
   (`SellerReturnDetail.tsx`), the seller can dispatch a return to any other
   *viable* path from the same EV breakdown already shown there — refurbish,
   local resale, donate, recycle, liquidate, warehouse — not just the AI's
   own recommendation, and not just a local-resale-vs-warehouse binary. It
   becomes the actual `ReturnRoutingDecision`, a real operational dispatch.

**Out of scope**
- Real eco-credit reward logic beyond what spec 015 already computes — this
  iteration only gives the existing real number better UI; no new
  ledger/reward mechanism.
- Rewiring the per-item liquidate EV term to the full bid-curve engine — read
  the reasoning first; it turned out to be intentional, not a gap.
- Any change to the hub-bench checkpoint flow (`/seller/hub`) — this is the
  returns-queue detail page (`/seller/returns/[returnId]`), a separate seller
  surface.
- Giving the returning customer any operational choice — confirmed not the
  right design; the customer flow stays purely informational (as it always
  was — spec 002/016/104's "logic decides, model narrates").

## Affected files

- `apps/web/src/app/seller/returns/[returnId]/SellerReturnDetail.tsx` —
  `formatRupees()` helper for `routing.localMargin`/`warehouseMargin`; the
  Product Health Card is now a real inline section (the old click-to-open
  modal and its "View Condition Report Card" button are gone); the old
  narrow "Approve for Local Listing / Send to Warehouse Instead" CTA is
  replaced by a full route picker inside the Intelligent Bridge card — every
  viable path gets a "Choose instead" (or "Confirm & dispatch" for the
  AI's own pick) button, gated on `needsSellerDecision` (any return still
  awaiting a dispatch decision, not just the ones the AI itself routed to
  `local_resale`); new `handleChooseOtherRoute()`; `handleApprove()` and
  `handleSendToWarehouse()` now also persist the decision swap when their
  route wasn't already the AI's own recommendation.
- `apps/web/src/lib/mocks/return-store.ts` — `SEEDED_RETURNS`' margin
  literals corrected from pseudo-cents to real rupees; `getSubmittedReturns()`
  now merges localStorage overrides field-by-field (only mutable interaction
  state) instead of taking the whole saved record, so a source fix to seed
  data can never be permanently masked again; new `applySellerRouteChoice()`;
  one seeded return (`RET-2026-800002`, refurbish-recommended) given a real
  `evBreakdown` and set back to `awaiting_pickup` so the picker has a
  non-`local_resale` example to show on immediately.
- `apps/web/src/components/return/health-card.tsx` *(new)* —
  `ReturnHealthCardDeep`, styled on `apps/web/src/components/sell/health-card.tsx`'s
  visual chrome (rotated card, VFD stamp, timeline, stamped footer), driven
  by `ReturnGradingResult`/`ReturnHealthCard`/`ReturnStateTransition[]`. No
  share-link affordance (unlike the Sell card) — `ReturnHealthCard` has no
  public URL at this stage.
- `apps/web/src/components/return/BuyerStep2Pickup.tsx` — wired to the new
  deep Health Card; added the `donate` explanation block. The route-override
  UI that was briefly added here was reverted — this screen stays purely
  informational, per the corrected design above.
- `packages/shared/src/return.ts` — `ReturnItemState` gains
  `'seller_route_choice'` (decision-phase state — nothing has physically
  moved, same category as `routed`).
- `packages/shared/src/routing-ev.ts` — a documentation-only comment on the
  `liquidate` path explaining why `liquidation-lot.ts`'s bid-curve engine
  runs at lot-staging time (`apps/web/src/lib/mocks/bulk-exchange-store.ts`),
  not per-item.

## Data contracts

```ts
// packages/shared/src/return.ts
export type ReturnItemState =
  | 'initiated'
  | 'evidence_captured'
  | 'routed'
  | 'seller_route_choice' // new — seller picked a different viable path pre-move
  | /* ...unchanged rest */;
```

No other shared type changes — the override reuses `ReturnRoutingDecision`,
`ReturnStateTransition`, and `RoutingPathEv` exactly as they already exist.

## UI / behavior

- **Seller return-detail page**: the Product Health Card is a real page
  section (no more click-to-open modal). The Intelligent Bridge card is now
  the seller's actual decision surface: every viable path shows its EV and a
  dispatch button; the AI's own pick is highlighted and gets "Confirm &
  dispatch" while every other viable path gets "Choose instead". This shows
  whenever a return still needs a decision (`pending_seller_approval` *or*
  `awaiting_pickup` — previously only the former, which excluded every
  non-`local_resale` recommendation from ever getting a seller decision
  point at all).
  - Choosing `local_resale` runs the existing real flow (backend record,
    buyer matching, agent-listing birth) regardless of whether it was the
    AI's own pick or a manual override.
  - Choosing `warehouse` flips status to `in_transit`, same as before.
  - Choosing any other route (refurbish/donate/recycle/liquidate/etc.)
    persists the new decision and marks the return `processed`.
- **Return Health Card** (seller page + buyer inline card, same component):
  grade/confidence/authenticity/defects/functional-verifiable/wardrobing, the
  trust-score narrative, and a real history timeline built from
  `SubmittedReturn.transitions` — e.g. "Return submitted → Photos captured →
  Routed by the Intelligent Bridge → Seller chose a different route."
- **Donate explanation** (buyer flow): when routed to `donate`, a dedicated
  card shows the NGO-partner framing plus a real "+N EcoCredits" badge when
  `routing.voucherEcoCredits` is set (spec 015's real, existing value —
  previously only a small map-popup suffix).
- **Buyer return-confirmation screen**: unchanged from before this spec — a
  purely informational EV breakdown, no action buttons. This is deliberate.

## Acceptance criteria

1. `pnpm -r typecheck` passes (shared/api/web).
2. A real return submitted through `/return/[orderId]` shows a correct (not
   ~100x-off) economic summary on the seller return-detail page; the seeded
   demo returns show their intended figures even after a source-code fix to
   their seed data (no stale localStorage masking).
3. Opening the Health Card on the seller return-detail page shows a real
   lifecycle timeline with real timestamps, directly on the page — no click
   required to reveal it.
4. Submitting a return that routes to `donate` shows the new explanation
   block with a non-zero EcoCredits figure whenever
   `routing.voucherEcoCredits` is set.
5. On the seller return-detail page, for a return in `pending_seller_approval`
   *or* `awaiting_pickup`, every viable path in the Intelligent Bridge card
   has a working dispatch button; choosing a non-recommended viable path
   updates `routing.decision` for real (persisted, survives reload) and
   moves the return to the correct resulting status.
6. A hard-gated (`!viable`) path never shows a dispatch button.
7. The buyer return-confirmation screen shows no action buttons on its EV
   breakdown — informational only.

## Resolved decisions

1. **The choice belongs to the seller, not the returning customer** —
   corrected mid-build after building it on the wrong side; the seller is who
   operationally decides what happens to inventory that comes back to them.
2. **Eco-credits stay UI-only this iteration** — no new reward logic;
   `routing.voucherEcoCredits` (spec 015) already computes a real value, this
   iteration only gives it proper UI treatment on the `donate` path.
3. **The liquidate EV term's per-item estimate is intentional, not a gap** —
   which buyer-type ultimately wins a not-yet-assembled pallet's bid isn't
   knowable per single item; the per-item estimate uses the category-average
   recovery fraction plus this item's own real manifest premium, and the full
   bid-curve engine runs for real once buyers actually bid on the assembled
   pallet (`bulk-exchange-store.ts`). Documented in `routing-ev.ts` rather
   than force-wired.
4. **The seller's choice reuses the existing checkpoint-transition
   mechanism** (spec 016's `recordTransition()`) via a new
   `applySellerRouteChoice()`, rather than inventing a parallel state-update
   path — a seller override is modeled as a self-loop transition into a new
   `seller_route_choice` lifecycle state, since nothing has physically moved
   yet.
5. **Seed-data overrides are field-scoped, not whole-record** — only mutable
   interaction state (status, approval timestamps, listing/lot links,
   transitions) comes from localStorage; grading/routing/pricing always track
   current source. This was a real bug (a source-code fix to seed margins
   stayed invisible behind a stale saved record) and is now fixed generally,
   not just patched for the one return that exposed it.
6. **No share-link affordance on the Return Health Card** — unlike the Sell
   flow's `ProductHealthCard`, `ReturnHealthCard` has no public
   `healthCardUrl`; inventing one for an item not yet listed anywhere would
   be exactly the kind of faked-output shortcut the project's philosophy
   rejects (agent-work.md).
