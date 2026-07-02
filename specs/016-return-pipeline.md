# 016 — The Return Pipeline: one decision engine, decided before the item moves

## Goal

Rebuild ReLoop's product thesis around a single vertical: **the return pipeline**.
At the moment a customer clicks Return, AI grades the item at the doorstep and one
deterministic, explainable decision engine chooses the item's best next life —
restock, local resale, refurbish, liquidate, donate, recycle, or the standard
reverse-logistics flow — **before any reverse-logistics cost is incurred**.

The SELL / Trade-In vertical is retired from the pitch (kept in-app as shared
rails only). The governing principle that killed it:

> **Information only has value if it changes a decision before money is spent.**
> In Trade-In the destination is fixed (Amazon's facility) regardless of grade, so
> doorstep AI changes nothing physical — pure cost. In Return, the destination IS
> the decision, and today Amazon makes it at the worst possible moment: after
> pickup, sortation, linehaul, and days-to-weeks of dwell.

### Why this beats Amazon's current workflow

Amazon's sequence today: refund → pickup → delivery station (pass-through) →
sortation → linehaul to a returns processing center → dwell in queue → manual
grade → disposition (restock ~10–20%, Grade-and-Resell, liquidate, donate,
destroy) → often another linehaul. Five to seven touches, 2–6 weeks, decision last.

ReLoop is an **information-timing arbitrage**: use noisier information (doorstep
photos) at the moment of maximum leverage instead of perfect information
(physical inspection) after all costs are sunk. The AI does not replace final
inspection — inspection moves to the cheapest node that still precedes
irreversibility (the local hub, before any buyer sees the item).

The downside is bounded by design: every wrong local decision degrades to "send
it up the chain", which is what happens to 100% of items today. **Amazon's
current workflow is the engine's fallback, not its competitor.** The AI only has
to satisfy `P(correct route) × savings > P(wrong route) × correction cost`, and
the correction cost is a shelf move at a hub, not a lost item.

## Scope

**In scope**
- The decision-engine upgrade (restock path, grade posterior, time decay,
  confidence gates) in `packages/shared/src/routing-ev.ts`.
- The return-item **state machine** with checkpoint re-evaluation (shared types,
  API transitions, driver-checkpoint + hub-bench UI).
- Pitch/docs restructure (DEMO-SCRIPT, README, CLAUDE.md, PITCH.md) — spec'd
  here, shipped alongside.

**Out of scope**
- Fleet-level assignment optimization (pickup batching, hub capacity planning) —
  a real production concern, documented below, deliberately not built.
- Training a real demand model — `P(sale in k days)` is mocked in the same style
  as the existing SKU-prefix pricing mocks.
- Changes to `ml/pricing` internals (the XGBoost + bandit stack is consumed as-is).
- Removing the SELL flow from the app (it stays as shared rails, out of the pitch).

## Background: Amazon's returns machine today

To see what the pipeline deletes, name the nodes and walk today's journey.

**The node types** (reverse-logistics network):

| Node | What it is | Where it sits |
|---|---|---|
| **Delivery station** | Last-mile depot — vans start/end their routes here | In-city, one per few neighbourhoods |
| **Sortation center** | Middle-mile cross-dock that batches parcels between stations and the linehaul network | Metro edge |
| **Returns processing center (RLC)** | Where returns are received, queued, inspected, graded, and dispositioned | Regional — often hundreds of km away |
| **Fulfilment center (FC)** | Sellable inventory + outbound orders | Regional/metro |
| **Liquidation / donation partners** | Buy graded-out inventory by the pallet / take donations | Varies |

**Today's return journey, leg by leg** (and what ReLoop does to each):

| # | Leg | Cost/dwell accrued | ReLoop's effect |
|---|---|---|---|
| 1 | Customer clicks Return → label/QR issued | — | **Grades here** (photos + priors) and routes before anything moves |
| 2 | Pickup / drop-off → **delivery station** | Last-mile cost (spent either way) | Driver checkpoint rides along for free; **locally-routed items STOP here** |
| 3 | Station → **sortation center** | First avoidable leg | **Deleted** for local routes |
| 4 | Sortation → **RLC linehaul** | The big freight leg (our 580km mock) | **Deleted** for local routes |
| 5 | RLC receiving queue → inspection | **Days-to-weeks of dwell** = price decay + working capital + storage | Replaced by a 10-min hub bench at the station the item already visited |
| 6 | Manual grade → disposition decision | Decision made LAST, with all costs sunk | Made FIRST (stage 0–3), re-checked at checkpoints |
| 7 | Disposition execution: restock → FC (another leg), liquidate → pallet + partner haul, donate/destroy | Often a **second linehaul** | Restock goes station→nearest FC directly; pallets/donations batch at the hub |

Net: today ~10–20% of returns get restocked and the average unit is touched 5–7
times over 2–6 weeks before its fate is decided. Every leg from #3 onward is
avoidable for any item whose best next life is local — but only if the decision
exists before leg #3. That is the entire product.

## The optimization problem

Per returned item, choose route `r ∈ {restock, local_resale, refurbish,
liquidate*, donate, recycle, warehouse, return_to_seller}` maximizing

```
EV(r) = Σ_g P(g | evidence) · recovery(r, g) · decay(t_r)
        − logistics(r) − handling(r) − E[correction_cost(r)]
        − λ · CO2(r)
```

subject to (evaluated in this order, never optimized away):

1. **Hard-constraint ladder** — safety/legal/policy (hazmat → certified recycle,
   counterfeit → seller, 3P not opted in → return_to_seller, …). Already
   implemented; extended with restock eligibility.
2. **Confidence gates** — route `r` is eligible only if grading confidence ≥ θ_r.
   Gates are *derived* from correction cost, not arbitrary: θ_restock is high
   (a bad unit reaching a buyer as "new" costs a second return plus trust),
   θ_donate is low (being wrong is nearly free). Low confidence therefore
   collapses the eligible set toward `warehouse` — graceful degradation to
   today's flow with no special-case code path.

\* liquidation is modeled inside the `warehouse` path economics today (FC
liquidation recovery); hub-staged manifested pallets are the roadmap upgrade.

Three terms are the upgrade over the existing engine:

- **`P(g | evidence)` is a posterior distribution, not a point grade.** Routes
  differ in error sensitivity — restock is brutally sensitive to a wrong A,
  donation barely cares. The engine computes recovery as an expectation over
  grades instead of trusting a single label.
- **`decay(t_r)` prices time.** Each route has an expected time-to-cash;
  category-specific decay (electronics steep, home goods flat) makes the engine
  *see* that weeks of returns-center dwell are a real P&L line. This is the
  mathematical heart of "decide before it moves".
- **`E[correction_cost(r)]` prices being wrong**, which is what makes the
  confidence gates principled (see above).

Fleet-level, there is a second optimization (assignment: pickup batching, pallet
consolidation, hub bench capacity). Per-item greedy + batch-at-hub is the honest
scope here; the assignment problem is noted for production.

## The backbone: return-item state machine

A return is a **lifecycle, not one decision**. The engine re-runs at every
physical checkpoint, because information improves and redirection cost rises as
the item moves:

```
INITIATED ──► EVIDENCE_CAPTURED ──► ROUTED (provisional, has TTL)
     ──► PICKUP_VERIFIED   (driver scan — checkpoint 1, cheap redirect)
     ──► AT_LOCAL_HUB ──► HUB_VERIFIED  (bench — checkpoint 2, last cheap redirect)
     ──► execution:
           LISTED_LOCAL → SOLD → DELIVERED_TO_BUYER
           REFURB_QUEUE → (re-enters at higher grade)
           RESTOCK_OUTBOUND → RESTOCKED
           PALLET_STAGING → LIQUIDATED
           DONATION_BATCH → DONATED
           RECYCLE_BATCH → RECYCLED
           RL_OUTBOUND → (today's flow — the universal fallback edge)
```

Two properties do all the work:

- **Every transition re-invokes the same decision engine** with updated evidence
  (driver photos, hub bench results, current demand). "Demand changed while
  routing was planned" stops being an edge case — it's a re-evaluation at the
  next checkpoint. Static fallback chains are replaced by "re-run the engine
  from the current state".
- **Every state has a defined cost-to-redirect.** At ROUTED it's zero. At
  AT_LOCAL_HUB it's a shelf move. At SOLD it's a buyer notification. The engine
  reasons about commitment, not just value.

## Stage-by-stage pipeline

### Stage 0 — the click: a prior before any photo
Structured return reason + days-since-delivery + category return stats + item
price + customer trust score → prior `P(grade)`, `fraudRisk`, and a capture plan.
Reason alone is hugely informative ("changed mind" → overwhelmingly like-new;
"defective" → clusters at C/Salvage). Two fast paths fall out: *sealed
changed-mind* (light grading, provisional restock/local-resale) and *high fraud
risk* (standard RL, no doorstep intelligence exposed). Evidence collection is
itself EV-gated: a ₹500 item gets 2 photos, a ₹20,000 laptop gets the full
checklist. Tech: rules + a small gradient-boosted classifier (same stack as the
pricing model).

### Stage 1 — guided evidence capture (doorstep grading)
Category-specific photo checklist from the SKU manifest (front/back, ports,
serial plate, accessories laid out, packaging state); camera-only capture.
Models:
- **Our DINOv2 grader** (`ml/grading`) → **grade distribution** + defect tags.
  (Output-contract change: distribution, not a point grade.)
- **VLM** (NVIDIA API) → open-set defect narration + accessory/completeness
  check against the manifest.
- **OCR** on serial/label → authenticity vs order record; Health Card identity
  anchor.
- **Anti-fraud**: perceptual-hash match vs catalog/stock/past uploads
  (photo-reuse), capture-time attestation (no gallery), EXIF/lighting checks.

Outputs: posterior `P(g | photos, prior)`, defect list, completeness vector,
confidence, fraud flags. The **Product Health Card is minted here** — its
lifecycle now starts at the return click; every later checkpoint stamps it.

### Stage 2 — valuation: price every (route × grade) cell
- Clearing price per grade: existing XGBoost pricing model.
- Local demand: upgrade `nearbyBuyers: number` → **P(sale within k days at price
  p within radius R)** (Mesh/Store signals, category sell-through). This one
  curve decides local resale vs everything else.
- Refurb uplift, defect-level: defect → repair cost → grade delta ("missing
  charger: ₹300, B→A, +₹1,500") — upgrading today's grade-level fractions.
- Liquidation recovery (category cents-on-the-dollar), donation credit
  (tax/CSR), recycle materials value from SKU composition.
- Category price-decay curve → the `decay(t_r)` input.

### Stage 3 — the decision engine (Intelligent Bridge, upgraded)
Hard ladder → confidence gates → EV argmax (formula above) → chosen route,
ranked alternatives with full signed-term breakdown (glass-box), **decision
TTL**, and LLM narration on top. "Logic decides, the model narrates" —
unchanged. Determinism is a business requirement: every `destroy` and every
denied local routing needs a replayable reason for seller disputes and ESG
audits.

### Stage 4 — pickup: the driver checkpoint
Driver app shows expected item + AI grade summary; ~30-second structured scan
(matches photos? packaging? seal?). Anti-fraud checkpoint #1, nearly free — the
driver is already standing there. **Refund timing is the fraud lever**: instant
refund at doorstep only when `trustScore × confidence` clears a threshold;
otherwise refund releases at hub verification (mirrors Amazon's existing
refund-at-first-scan policy family). Driver contradiction → posterior update →
engine re-runs before the van leaves the neighborhood.

### Stage 5 — the local hub (delivery station, not FC)
**Key operational insight: returned items already flow through the delivery
station today** — it is the first node after pickup, in-city, currently a pure
pass-through toward sortation and the linehaul. We add **zero** new transport
legs: we stop the item there and delete the legs above it.

Hub bench (~10 min/item): (1) human confirms/overrides the AI grade —
checkpoint #2, the last cheap redirect, and where "the AI was wrong" is caught
*before any buyer is exposed*; (2) functional check for powered items; (3)
repackage (poly/box + label, Health Card QR stamped with the inspection); (4)
consolidation — liquidation-bound items pallet-staged by category, donation
batches per nonprofit run.

Direct doorstep-to-doorstep survives only as the exception (factory-sealed +
driver-verified seal + high trust). Hub-mediated is the default — that is what
keeps this Amazon-grade trust rather than OLX-grade, and what makes "missing
packaging" and "can't ship directly" non-events.

If the hub downgrades: engine re-runs from AT_LOCAL_HUB; the item cascades
(resale → pallet → donate → recycle) without leaving the city. Correction cost
realized: one shelf move.

### Stage 6 — destinations: when, why, where the money is

| Route | Trigger | Data / model | vs Amazon today | Saved / earned |
|---|---|---|---|---|
| **Restock** *(new)* | Sealed or verified-A + reason ∈ {changed mind, didn't fit} + SKU live + healthy sell-through | Catalog status, FC inventory, sell-through | Rides to a returns center, dwells weeks, maybe restocks (10–20% overall) | Straight to **nearest FC inbound** as sellable; deletes the returns-center hop + weeks of dwell; sells before markdown |
| **Local resale** *(flagship)* | Grade A/B, mid-value band (~₹1.5k–₹15k), demand curve clears | Clearing price (XGBoost), P(sale in k days), Health Card | Liquidated for cents, or resold weeks later from an FC | Recovery 60–80% of clearing vs ~10–30% liquidation; zero linehaul; cash in days |
| **Refurbish** | Defect with positive uplift: `price(g′) − price(g) − repair − logistics > 0` | Defect→repair-cost table, partner capacity | G&R grades at the FC but makes no repair decision at source | ₹300 cable turns B→A worth +₹1,500; re-enters local resale |
| **Liquidate** | Functional, low unit EV (cheap / saturated / weak used demand), or high uncertainty on a functional item | Category recovery rates, hub pallet staging | Liquidation is the residual after items sit at the returns center | **Hub pallets carry Health Card manifests** — graded, transparent pallets command higher cents-on-the-dollar; FC hop deleted |
| **Donate** | All commercial EVs < donation credit; or resale policy-blocked but destruction wasteful | Nonprofit demand registry (Good360 model) | Same conclusion, reached after full RL cost is sunk | Half handling, zero freight, Climate Pledge/CSR value, ledger receipt |
| **Recycle** | Forced (hazmat/hygiene/recall/salvage) or materials value > handling | SKU material composition, certified recycler map | Same, after two truck rides | Local certified drop; commodity recovery; carbon credit |
| **Destroy** | Legally required only (counterfeit, recall, contamination) | Compliance flags | A meaningful % of returns die by default | Engine KPI is **shrinking this set**; every destroy logged with a replayable reason |
| **Standard RL** *(fallback)* | Low confidence, no evidence, fraud flags, special handling, customer opt-out | — | *Identical to today* | Zero, by design — the graceful-degradation guarantee |

### Stage 7 — the Return Listing Agent + the Demand Graph (the autonomous executor)

Dispatch is not the end of the pipeline — "listed locally" is a state that still
has to be *won*. Two pieces own it, both born the moment the hub bench confirms
`local_resale`:

**7a. The agent (spec 008, lifted into returns).** `handleConfirmDispatch`
creates a real marketplace listing (Health Card minted from the return's own
checkpoints: doorstep grade → driver scan → bench verification) and spawns a
Listing Agent instance on it. The wiring that makes it principled:

- **Floor = route-elsewhere value.** The agent's hard price floor is seeded from
  the routing EV's warehouse/salvage path — so the spec-014 `hard_floor`
  guardrail fires (and the agent escalates) *exactly when local resale stops
  beating "send it up the chain"*. Spec-016 economics drive spec-014 escalation
  with zero new logic.
- **Event-driven repricing (spec 014).** Each simulated day passes a significance
  gate (comp undercut, view-velocity drop, dwell thresholds, 3-day heartbeat);
  significant events hit `POST /api/pricing/decide` (XGBoost reward model +
  Thompson bandit + deterministic guardrails), with the pure `decideAgentAction`
  brain as the offline fallback. Dynamic pricing while listed is the unique
  capability — a returns centre cannot reprice a queue.
- **Escalation re-enters the Bridge.** Accepting the agent's recommendation
  transitions the return's lifecycle (`listed_local → donation_batch |
  recycle_batch`) through the same state machine — the item cascades, it never
  rots on a shelf.
- Surface: `/seller/local-listings` (queue, live price + floor + comparable,
  advance-day/auto-run, matched buyers, activity feed, escalate banner).

**7b. The Demand Graph (buyer-finding as an ADDITIVE layer on Amazon's
recommendation system).** Amazon already knows who searched, wishlisted, or
bought similar items near the hub — the demand graph (`lib/demand-graph.ts`)
scores that intent instead of inventing a marketplace:
`matchScore = intentWeight(searched .65 / wishlisted .8 / purchased_similar .9)
× distanceDecay × priceFit`. It produces (a) **ranked buyer matches** — real
demo accounts first, synthetic locals as fill — and (b) the **demand curve**
(`nearbyBuyers`, demand level, `P(sale in k days)`) that the agent's market
context runs on, so matching and pricing share one signal.

**Buyer surfaces (where the matched buyer actually sees it):**
- **Open-box on the buy-new page** — the flagship: the exact product page shows
  "Open-box near you · doorstep graded · hub verified · X% off · delivered
  today", with the recommendation layer speaking ("this is on your wish list").
- **Shop feed** — return listings flow into the regular resale feed, tagged
  `Open-box · doorstep graded`, at the agent's live price.

**The purchase closes the lifecycle.** Buying (a real cross-account transaction)
runs `completeReturnSale`: `listed_local → sold → delivered_to_buyer`, the deal
is marked complete on the seller side, EcoCredits land in both ledgers, and the
agent retires. Multiple buyers → rank by match score (delivery cost/speed/
return-risk in prod). Buyer rejects on delivery → item returns to the hub (same
city — one local trip) and re-enters at AT_LOCAL_HUB.

### Stage 8 — ledger and close-out
Inventory reconciliation, seller dashboard aggregation, carbon accounting
against the internal ₹2/kg CO₂ price with EV-capped vouchers (015 — already
wired to the same EV terms, so carbon and cash never disagree). Health Card
transfers to the new owner.

## Edge cases → owning mechanism

| Edge case | Mechanism |
|---|---|
| Package already opened | Normal case — completeness vector + seal check move the posterior |
| Original packaging missing | Hub repack is the default workflow; small handling term |
| Accessories/cables missing | VLM manifest check → refurb route (uplift positive) or grade-down |
| Can't ship directly to a buyer | Hub-mediated is the default; direct P2P is the rare exception |
| Needs repackaging | Stage 5 |
| Low AI confidence | Confidence gates shrink eligible set toward standard RL — no special-case path |
| AI grade wrong | Caught at driver scan / hub bench before buyer exposure; bounded correction; hub verdict becomes a training label |
| Customer hides damage | Driver checkpoint + refund timed to trust × confidence + photo-reuse/capture attestation |
| Local buyer rejects | Item still in-city; re-enters at hub; one local trip |
| No nearby buyer | Demand curve priced it → engine chose another route; unsold listing → dwell expiry → re-run |
| Multiple buyers | Rank by fulfillment cost, speed, buyer return-risk |
| Demand shifts mid-route | Decision TTL; re-evaluated at each checkpoint while redirect is cheap |
| Unsellable after inspection | Hub cascade: pallet → donate → recycle, same building |
| Return window expired | Not a return — out of scope (old SELL territory, retired) |
| Special-handling category | Hard ladder, evaluated first, never EV-optimized |

## The flywheel

Every doorstep grade later confirmed or overridden at the hub is a free labeled
training pair (photos → verified grade). The grader improves as a byproduct of
operations — the data moat (ties into the spec-106 narrative). Graded
liquidation pallets and audited destruction are second-order wins nobody gets
without grading at source.

## Affected files

- `packages/shared/src/return.ts` — grade posterior type, `ReturnItemState`,
  transition contract, decision TTL, `restock` in the decision union.
- `packages/shared/src/routing-ev.ts` — restock path + EV terms, posterior
  expectation, `decay(t_r)`, confidence gates θ_r.
- `apps/api/src/lib/routing-engine.ts` — adapter feeds posterior/decay mocks.
- `apps/api/src/routes/route.ts` (+ new state-transition route) — lifecycle
  endpoints; each transition re-invokes `computeRouting`.
- `apps/web` return flow — driver-checkpoint step; new hub-bench screen under
  the seller/ops surface.
- `DEMO-SCRIPT.md`, `README.md`, `CLAUDE.md`, `PITCH.md` — all-in Return.

Stage-7 build (v2 — agent + demand graph):
- `apps/web/src/lib/demand-graph.ts` — intent signals, `matchBuyers`,
  `demandCurve`, `matchReasonLine`, SKU→store-product map.
- `apps/web/src/lib/return-market.ts` — `findOpenBoxOffer`,
  `completeReturnSale`, `getReturnListings`.
- `apps/web/src/app/seller/hub/page.tsx` — `birthReturnListing` at dispatch
  (listing + Health Card + agent, floor = warehouse-path EV).
- `apps/web/src/app/seller/local-listings/page.tsx` — the agent surface.
- `apps/web/src/lib/agent-store.ts` — `markAgentSold`.
- `apps/web/src/components/store/open-box-offer.tsx` (+ store product page) —
  the open-box buyer surface; `market.ts`/`shop-card`/`shop-detail` — open-box
  tag + purchase-closes-lifecycle hook.
- `apps/web/src/mock/casual-listings.ts` (`returnId`, `storeProductId`),
  `apps/web/src/lib/mocks/return-store.ts` (`sku`, `listingId`,
  `linkListing`).

## Data contracts

New/changed in `packages/shared` (source of truth):
- `GradePosterior = Record<Grade, number>` (sums to 1; engine also accepts the
  legacy point grade and lifts it to a degenerate posterior).
- `ReturnItemState` union + `ReturnStateTransition { from, to, at, evidence,
  decision }`.
- `ReturnRoutingDecision.decision` gains `'restock'`; decision gains `ttlHours`.

## Acceptance criteria

1. `pnpm -r typecheck` passes (strict, no `any`).
2. Routing eval harness still passes; existing `computeRouting` callers work.
3. Dev walkthrough: return flow → doorstep grade → EV screen shows the restock
   path and confidence gating → driver checkpoint → hub bench override → the
   engine visibly re-routes live.
4. Low-confidence input demonstrably collapses routing to `warehouse` (the
   fallback guarantee, on screen).
5. **The full pipeline, end to end (v2):**
   1. As **meera**: return an item (changed mind, opened box) → doorstep grade →
      Bridge routes `local_resale` → journey strip.
   2. As **techbazaar**: Hub Bench → driver scan → bench verify → Confirm &
      dispatch → listing + agent born; visible in **Local Listings** with
      matched buyers from the demand graph.
   3. Advance days / auto-run → repricing ticks in the feed (spec-014 decide
      path when the API is up; deterministic fallback offline).
   4. As **aarav**: the matching Store product page shows **Open-box near you**
      (or the Shop feed shows the tagged listing) → Buy.
   5. Back as **techbazaar**: the return reads `delivered_to_buyer` / deal
      completed, EcoCredits in both ledgers, transition log complete.
   6. Alternate ending: never buy → price hits the route-elsewhere floor →
      `escalate_route` → accept → lifecycle shows `donation_batch` /
      `recycle_batch`.

## Resolved decisions / open questions

- **Resolved:** Trade-In/SELL as a vertical is retired from the pitch;
  the SELL flow stays in the app as shared rails (grading/pricing/Health Card)
  with reduced nav prominence. Full removal only on explicit call.
- **Resolved:** hub = delivery station (in-city, already on the return path),
  not a regional FC; hub-mediated is the default for all locally-routed items.
- **Open:** liquidation as a first-class engine path (vs inside `warehouse`
  economics) once hub pallet staging is modeled end-to-end.
- **Open:** real demand curve + decay parameters (mocked per category for now).
