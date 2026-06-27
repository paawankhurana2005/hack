# 104 — Routing as Expected-Value Optimization (Phase 3)

## Goal
Turn "decide the best path" into an actual **value-vs-carbon optimization** while
keeping the auditable hard-constraint ladder. The decision stays deterministic and
glass-box; ML feeds the inputs (clearing price × sell-through from P1/P2) and freight
math is real. Same hard-rule decisions as before; the old soft rules become an
explainable EV argmax with every term shown on screen.

## Two-layer decision (both deterministic)
1. **Hard constraints (safety/legal) — never optimized away.** An ordered first-match
   ladder: 3P-not-opted-in → return_to_seller; counterfeit/not_as_described →
   return_to_seller; **hazmat/restricted → certified disposal (recycle)**; wrong_item →
   warehouse; authenticity mismatch → warehouse; **high-value + unverified →
   fraud/verification gate (warehouse)**; **reason↔grade mismatch → fraud review
   (warehouse)**; salvage/ungradeable → recycle; arrived_damaged → recycle.
2. **EV optimization** over the remaining viable paths (local_resale / refurbish /
   donate / recycle / warehouse): each path's EV = expected recovered value − cost −
   carbon penalty, using **clearing price × sell-through** (P2), refurb cost/uplift
   (condition-dependent), donation/recycle residual, and **real freight cost + carbon
   for the warehouse round-trip**. Pick the argmax. Every term is returned for display.

The model proposes inputs; the engine's arithmetic is fully reproducible.

## Realistic economics
Refurbishment uplift/cost scale with condition (a near-new item gains ~5%, a worn one
~35%) and refurbish is only viable when there's condition to recover or the item
couldn't be functionally verified — so local_resale wins for good items and refurbish
only wins for worn items with strong demand. Carbon is priced (₹2/kg); freight is
₹2/km over the FC distance (constant now; **AWS Location Service** in prod).

## Affected files
- **shared (new):** `routing-ev.ts` — `RoutingEvProfile`, `hardConstraint`, `evByPath`,
  `decideRoute`, `PathEv`/`EvTerm`/`RoutingEvResult`. **shared (edited, additive):**
  `return.ts` — `ReturnRoutingDecision.evBreakdown?` + `RoutingEvBreakdown`/
  `RoutingPathEv`. `index.ts` exports the engine.
- **api:** `lib/routing-engine.ts` `computeRouting` rewritten as a thin adapter over
  `decideRoute` (same signature + same hard-rule outcomes; SKU-keyed economic profile,
  values converted to paise); `routes/route.ts` returns `evBreakdown` + margins +
  warehouse distance.
- **web (additive):** `BuyerStep2Pickup.tsx` renders the **Intelligent Bridge EV
  breakdown** (per-path EV bars, chosen highlighted, local-vs-warehouse + CO₂) on the
  live return screen, computed via the shared engine with an order-grounded clearing
  proxy. Seller dashboard untouched (it can read the additive `evBreakdown` when ready).

## Acceptance criteria — all met
1. `pnpm -r typecheck` — green (strict, no `any`). ✅
2. `pnpm eval` — `(synthetic seed)`:
   - **Routing hard-rule conformance: 100% (N=8)** — the safety/legal ladder still
     forces exactly the expected paths.
   - **Routing EV optimization: 100% argmax selection (N=6), 4 distinct paths chosen**
     [local_resale, refurbish, donate, warehouse] — the decision genuinely varies with
     the economics.
   - Grading/calibration/pricing unchanged; return-risk `n/a (P4)`. ✅
3. `pnpm --filter @reloop/web build` — green; seller dashboard untouched. ✅
4. `POST /api/route` returns `evBreakdown` (per-path EV terms), `localMargin`/
   `warehouseMargin`, and `warehouseDistanceKm`; the chosen path is the argmax EV among
   viable paths after the hard ladder. ✅

## Edge cases handled
Hazmat/restricted → dedicated certified-disposal path. High-value + unverified →
fraud/verification gate. Reason↔grade mismatch → fraud review. No nearby buyers →
local_resale not viable (excluded from argmax). Warehouse path yields no handoff
(unchanged). Salvage/ungradeable and arrived_damaged still hard-routed to recycle.

## Deferred to Phase 6
Real freight distance + locker/buyer geo via AWS Location Service; the locker_full /
no_locker / pickup-failed handoff fallbacks; a DynamoDB decision audit log; wiring the
`evBreakdown` into the seller dashboard (teammate-owned).
