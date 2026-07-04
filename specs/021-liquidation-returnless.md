# 021 (spec "016.1") — Honest economics: liquidation lots, defect-level refurb,
# correction cost, returnless refund

## Goal

Spec 016 shipped the Return Pipeline as the product and left two things
unresolved: liquidation lived *inside* `warehouse` economics instead of being a
first-class engine path, and the EV formula's `E[correction_cost(r)]` term was
documented but never implemented. Studying how Amazon's own returns machine
actually prices things (below) closed both gaps and surfaced two more: refurb
was viable with zero downstream demand, and there was no lever for "every route
loses money — just refund it," which Amazon genuinely uses today.

**The research that grounds every constant in this spec:**
- Amazon FBA Liquidations nets sellers only **5–10% of average selling price**
  after a 15% referral fee + per-unit processing; payout lands 30–90 days out.
  Amazon itself sells to liquidators at **20–30¢ on the retail dollar**, and the
  downstream reseller chain (liquidator → regional reseller → bin store)
  averages 5–20¢. [nexscope.ai, myamazonguy.com, palmettodigitalmarketinggroup.com]
- **Manifested (item-listed, graded) pallets command materially more** than
  unmanifested "mystery lot" pallets — this is the exact premium a Health-Card
  manifest earns, priced by a real secondary market. [threecolts.com, sellerapp.com]
- Grade & Resell recovers up to ~80% of value but grades **after** the linehaul,
  and grading takes ~3 weeks (longer in Q4); only **~10–20%** of returns ever get
  restocked. [sellerlabs.com, allthingscircular.com]
- Processing a return costs **~$27 per $100 order** once restocking, shipping,
  and inspection labor are counted — for cheap items this alone can exceed every
  recovery path, which is why **returnless refunds** are a real, sanctioned
  Amazon lever, not a hack. [makemyreceipt.com]
- Returns fraud runs **9–15% of returns**, so any new refund-without-return
  lever has to hard-gate on trust and fraud signals, never on value alone.
  [einvoicegenerator.com, loopreturns.com]

## Scope

**In scope**
- `liquidate` as a first-class routing decision — a Health-Card-manifested
  pallet staged at the hub, priced by a new deterministic lot engine
  (`packages/shared/src/liquidation-lot.ts`).
- The `warehouse` path repriced honestly: a mixture of "maybe restocked after
  inspection" (≈15% of the time, at post-markdown recovery) and "unmanifested
  FC liquidation" (the rest, at ~20¢ recovery), replacing the old flat 0.6
  recovery fraction — which was fiction.
- `E[correction_cost(r)]`, the EV formula term that was documented but never
  built: expected cost of routing wrong = (posterior mass below the grade the
  route needs) × that route's redirect cost. Makes the confidence gates θ_r
  *derived* rather than hand-picked.
- Defect-level refurb economics: a `DEFECT_REPAIR_TABLE` (defect tag → repair
  cost + grade delta) replacing grade-level fractions when structured defect
  tags are available — the concrete version of spec 016's own promise
  ("missing charger: ₹300, B→A, +₹1,500").
- Bug fix: refurbish is no longer viable with zero nearby buyers (a repaired
  unit re-enters local resale — with no downstream channel there is nowhere
  for it to go).
- `returnless_refund` as a routing decision: when every movement path has
  negative EV and trust/fraud/value gates all pass, refund and let the
  customer keep the item. Hard-gated — never for high-value items, never with
  any fraud signal, opt-in via a `customerTrust` input so existing demo flows
  are byte-unaffected unless trust is supplied.
- Bulk-lot / pallet functionality, wired for real: the existing (previously
  un-integrated, `Math.random`-driven) `bulk-exchange-store.ts` now calls the
  deterministic lot engine; hub-bench items routed to `liquidate` stage
  themselves into an open per-category pallet automatically. UI stays dummy —
  a status strip on the hub page and one new row in the existing bulk-exchange
  page; no new polished screens.

**Out of scope**
- A real secondary-market pricing feed (bid curves are documented mocks, same
  posture as the existing SKU-prefix pricing mock).
- Carbon vouchers for `liquidate`/`returnless_refund` (no
  `AvoidedEmissionsRoute` exists for either — deliberately not invented here).
- Fleet-level pallet logistics (multi-hub consolidation, real carrier booking).

## Affected files

- `packages/shared/src/return.ts` — decision union gains `liquidate` and
  `returnless_refund`; new `DefectTag` union; `ReturnItemState` gains
  `returnless_closed`; `RoutingScenario` gains both new values.
- `packages/shared/src/liquidation-lot.ts` *(new)* — the pure lot engine:
  `LotComposition`, `BID_CURVES` per buyer type, `manifestPremium`,
  `lotValueCents`, `bestBuyer`/`secondBestBuyer`, `shipNowOrWait` (closed-form
  ship-now-vs-wait breakeven), `LIQUIDATION_RECOVERY_FRAC`, `tagDefects`.
- `packages/shared/src/routing-ev.ts` — the liquidate path, the warehouse
  mixture, the correction-cost term, defect-level refurb, the returnless rule,
  and every `Record<ReturnPath, …>` map (`TIME_TO_CASH_DAYS`, `TTL_HOURS`,
  `DWELL`, `FALLBACKS`, `CONFIDENCE_GATE`).
- `apps/api/src/lib/routing-engine.ts`, `apps/api/src/routes/route.ts` —
  forward defects/manifest-coverage/trust/fraud signals; fixed-template
  narration for `liquidate` and `returnless_refund`.
- `apps/web` decision-union sites (labels/styles/panels — see below), plus
  `apps/web/src/lib/mocks/bulk-exchange-store.ts` (rewired to the lot engine,
  `BatchStatus` gains `staging`, new `stageReturnIntoLot`), `return-store.ts`
  (`lotId`/`linkLot`), `app/seller/hub/page.tsx` (bench profile signals, pallet
  staging on dispatch, agent floor now `max(warehouse, liquidate)` EV, a dummy
  pallet-staging strip), `app/seller/bulk-exchange/page.tsx` (staging status +
  panel).
- `apps/api/src/eval/edge-cases.ts` (+ `seed.ts`) — new deterministic
  assertions for all of the above.

## Data contracts

New/changed in `packages/shared`:
- `ReturnRoutingDecision['decision']` += `'liquidate' | 'returnless_refund'`.
- `DefectTag` — `missing_charger | missing_cable | scratched_screen |
  scuffed_body | worn_packaging | missing_manual | dead_battery |
  missing_accessory`.
- `ReturnItemState` += `'returnless_closed'`.
- `RoutingEvProfile` optionals += `defectTags?`, `manifestCoverage?`,
  `customerTrust?`, `fraudSignal?` (all omitted ⇒ legacy behavior for the hard
  ladder and argmax-consistency; absolute EVs are recalibrated for everyone by
  the honest warehouse mixture — see "Known changes" below).
- `LotComposition`, `LotBuyerType`, `LotValue`, `ShipVerdict` (new, in
  `liquidation-lot.ts`).
- `BulkBatch['status']` += `'staging'`.

## UI / behavior

- **Return flow (Step3Bridge / Step5Done):** two new decision panels —
  "Hub Pallet (Manifested)" for `liquidate` and "Keep It — Refund Issued" for
  `returnless_refund`. Returnless skips the handoff step entirely (nothing
  ever ships).
- **Hub bench:** confirming a `liquidate` decision stages the return into the
  open pallet for its category (`stageReturnIntoLot`), same building, no new
  transport leg. A pallet-staging strip shows fill level, current best buyer +
  bid, and the ship-now-vs-wait verdict, with a link into Bulk Exchange.
- **Bulk Exchange:** hub-staged pallets appear with a `staging` status
  ("Filling at hub") and a manifest-coverage line; manually-submitted batches
  are unchanged in shape, now priced by the same deterministic engine instead
  of `Math.random`.
- **Agent floor:** the Listing Agent's hard price floor (spec 008/014) is now
  seeded from `max(warehouse EV, liquidate EV)` instead of warehouse alone —
  "route-elsewhere" is honestly the pallet when the pallet beats the linehaul.

## Acceptance criteria

1. `pnpm -r typecheck` passes (strict, no `any`) across `shared`, `api`, `web`.
2. `pnpm test:edge` — 51/51 assertions pass, including: manifested pallet beats
   the honestly-priced warehouse path; manifest premium is monotone in
   coverage; warehouse recovery is pinned to the honest ≤31%-of-clearing
   blend; refurb is not viable with zero nearby buyers; defect-table repair
   cost beats the grade-level fallback; restock carries a negative
   correction-cost term when posterior mass sits below A (donate does not); θ
   gate ordering mirrors redirect-cost ordering; returnless fires only with
   trust + low value + no fraud + all-paths-negative (three negative
   controls); the B09-shaped hero-demo profile still routes `local_resale`
   (liquidate never cannibalizes the flagship); the legacy default profile is
   unchanged.
3. `pnpm eval` — routing hard-rule conformance and EV-argmax optimality both
   report 100%.
4. Manual walkthrough: return flow → liquidate scenario shows the manifest-
   premium term; returnless scenario shows "no pickup needed"; hub bench →
   liquidate → pallet strip fills → Bulk Exchange shows the staging lot with a
   deterministic buyer/value/ship-verdict; hero demo (meera local_resale → hub
   dispatch → agent → aarav open-box buy) is unchanged; a low-confidence input
   visibly collapses to the pallet, not the warehouse.

## Resolved decisions / open questions

- **Resolved:** low-confidence collapse target changes from `warehouse` to
  `liquidate` — being wrong on a manifested pallet costs a ₹15 re-sort, so
  θ_liquidate = 0.2 is the cheapest gate of any commercial path. Warehouse
  remains the ungated absolute fallback; the graceful-degradation guarantee is
  unchanged in kind, just cheaper in practice. `DEMO-SCRIPT.md` updated.
- **Resolved:** `returnless_refund` ships, opt-in via `customerTrust` so no
  existing demo path is affected unless a caller supplies it.
- **Resolved (016's open question):** liquidation is now a first-class engine
  path with hub pallet staging modeled end-to-end (composition → bid curves →
  ship-vs-wait), closing spec 016's "Open: liquidation as a first-class engine
  path… once hub pallet staging is modeled end-to-end."
- **Open:** real secondary-market bid curves (current `BID_CURVES` are a
  documented mock, same posture as the pre-existing pricing mocks).
- **Open:** fleet-level pallet consolidation across hubs (still explicitly
  out of scope, as in spec 016).
