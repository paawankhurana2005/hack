# 015 — Carbon Insetting → Amazon Voucher Engine

## Goal
Ground EcoCredits/voucher payout in real avoided-emissions methodology and cap
it by Amazon's own captured economics, so the reward is an honest, self-funding
mechanism rather than an unbounded marketing cost. Fix a real methodological
bug (recycling was priced as a discount off the *reuse* baseline, which
conflates two different avoided-emissions mechanisms) and connect the
routing engine's already-computed EV data to the voucher ledger for the first
time — RETURN-flow items currently earn zero EcoCredits despite the routing
engine calculating exactly the savings that should fund them.

## Framing: insetting, not offsetting
This is internal carbon **insetting** — avoided emissions counted toward
Amazon's own Climate Pledge Scope-3 target (net-zero by 2040), the same
category as Amazon's real re:Cycle reverse-logistics diversion reporting.
It is **not** a third-party-verified tradable credit: real registry credits
(Verra VCS, Gold Standard) require a Validation & Verification Body to audit
project design and monitored performance before a registry issues anything —
a process costing tens of thousands of dollars over months per project,
completely impractical per resold item. The product already uses the brand
term "EcoCredits" and never says "carbon credit" in user-facing copy; this
iteration keeps that discipline and adds one explicit disclosure line rather
than overclaiming.

## Methodology fix
Two distinct avoided-emissions mechanisms were being conflated:
- **Reuse** (resale/refurbish/donate displacing a new purchase) avoids the
  embodied carbon of manufacturing a replacement — the dominant, larger
  number. Per-category figures (unchanged from the original heuristic table,
  now cited): electronics 25kg, home 15kg, fashion 8kg, sports 6kg, toys 4kg,
  books 1kg, other 5kg CO2e. Independently in the right ballpark vs. published
  LCA precedent (sneakers ~14kg per MIT/Quantis; jeans ~33kg per Levi's LCA;
  smartphones ~55-90kg, laptops ~200-350kg per manufacturer environmental
  reports — the same category of methodology ThredUp/Green Story runs
  commercially for secondhand fashion).
- **Recycling** avoids landfill methane + recovers a fraction of virgin
  material extraction — a much smaller, independently-sourced number, based
  on EPA WARM's ~2.83 tCO2e avoided per short ton of material diverted from
  landfill, scaled to an assumed per-category item weight and a 50% recovery
  fraction.

Previously, `estimateRouteImpact('recycle', …)` computed `CO2_BASELINE_KG ×
0.4` — a flat discount off the *reuse* number. This is now sourced from an
independent WARM-based table (`carbon-methodology.ts`'s `AVOIDED_RECYCLE_KG`),
correctly smaller and methodologically distinct from the reuse baseline.
Donation keeps its existing 0.7 attribution factor (not every donated item
displaces a new purchase — a standard counterfactual discount), unchanged
numerically, now documented as such.

## The self-funding voucher formula (Track A: 1P RETURN only)
For RETURN-flow items Amazon directly owns (1P inventory), `routing-ev.ts`'s
`evByPath()` already computes the real dollar delta between the chosen path
and the warehouse counterfactual (freight + handling + carbon cost). That
number, previously only displayed, now funds the voucher:

```
capturedEvDeltaCents = max(0, chosenPathEv.evCents − warehousePathEv.evCents)
netAvoidedKg         = computeAvoidedEmissionsKg(category, route, logisticsCarbonKg)
carbonNarrativeCents = round(netAvoidedKg × CENTS_PER_KG_CO2)   // reuses routing-ev.ts's ₹2/kg internal price
voucherBudgetCents   = min(carbonNarrativeCents, round(capturedEvDeltaCents × FUNDING_SHARE))
```

- `FUNDING_SHARE = 0.25` — Amazon shares a minority (25%) of its captured
  savings as the reward, keeping the majority as the upside the routing
  engine exists to create. Same logic as typical affiliate/referral
  margin-sharing. Documented as a tunable business constant.
- The `min()` against `carbonNarrativeCents` is a second, independent
  guardrail: the customer is never rewarded for more carbon than was
  genuinely avoided, even when the EV delta is large (e.g. high-value
  electronics local resale).
- `CENTS_PER_KG_CO2` (₹2/kg ≈ $24/t) is reused unchanged from `routing-ev.ts`
  — deliberately, to avoid two disagreeing internal carbon prices in the same
  codebase. For the record: this conservatively sits near the floor of the
  real 2026 blended voluntary-carbon-market range (~$27–87/t corporate
  blended average), so it understates rather than overstates the narrative
  value.

## Scope
**In scope:** the methodology fix (all routes/flows), the EV-capped formula
for 1P RETURN, wiring the award into the RETURN confirmation screen
(previously zero EcoCredits were awarded there), one disclosure line on the
Rewards page and RETURN confirmation.

**Out of scope, deliberately:**
- **SELL-flow / 3P-opted-in RETURN ("Track B").** Amazon's own capture there
  is a marketplace commission/take-rate — a number that does not exist
  anywhere in this codebase. Rather than invent one, these flows keep today's
  flat `estimateImpact`/`estimateBuyerImpact` formula unchanged. **Roadmap:**
  once a real take-rate exists, the same EV-capped pattern extends naturally —
  Amazon's commission share becomes the counterfactual to cap against, exactly
  like the warehouse EV delta does for 1P today.
- **Strict per-item voucher-backing ledger.** `credits-store.ts`'s ledger is
  pooled and fungible; the formula above guarantees the system is self-funding
  *in aggregate/expectation*, not that a specific redeemed voucher traces to a
  specific return. Same trust model as typical cashback/loyalty programs. A
  strict, auditable per-item ledger would be a separate redesign.
- **Amazon-facing aggregate institutional view** ("ReLoop inset N tCO2e this
  quarter…"). No persisted, cross-account log of routing decisions exists
  today — building one is a real new subsystem, proposed as **spec 016**.
- **`ProductHealthCard.impact` field.** Impact display stays on the Rewards
  page + RETURN confirmation screen; it already flows through
  `provenance.ts`'s `cumulativeImpact()` for free with no code change needed.

## Affected files
- **shared (new):** `carbon-methodology.ts` — `AVOIDED_MANUFACTURING_KG`,
  `WARM_AVOIDED_KG_PER_KG_MATERIAL`, `ITEM_WEIGHT_KG`, `AVOIDED_RECYCLE_KG`,
  `DONATE_ATTRIBUTION_FRACTION`, `computeAvoidedEmissionsKg()`.
- **shared (new):** `carbon-vouchers.ts` — `FUNDING_SHARE`,
  `computeReturnVoucherCredits()`, `ReturnVoucherResult`.
- **shared (edited, additive):** `impact.ts` — `estimateRouteImpact('recycle',
  …)` now sources `AVOIDED_RECYCLE_KG`; `CO2_BASELINE_KG` now aliases
  `AVOIDED_MANUFACTURING_KG` (single source of truth, no duplicate table).
  `return.ts` — `ReturnRoutingDecision.voucherEcoCredits?` /
  `voucherFactors?`, same additive pattern as spec 104's `evBreakdown?`.
  `routing-ev.ts` — `CENTS_PER_KG_CO2` and `CO2_LOCAL_KG` now exported (were
  module-private) so the voucher formula reuses the same internal carbon
  price instead of inventing a second one. `index.ts` exports both new modules.
- **api:** `routing-engine.ts` — `computeRouting` now derives an `ItemCategory`
  from the SKU-prefix mock (mirrors the existing pricing mock's prefix
  pattern) and calls `computeReturnVoucherCredits` for 1P decisions, attaching
  `voucherEcoCredits`/`voucherFactors` to `RoutingComputed`. `route.ts` passes
  both through to the `ReturnRoutingDecision` response.
- **web:** `return-flow.ts` — `mockRouteItem` (the client-side demo scenario
  source) computes the same voucher via the real shared function, using a
  synthetic 2-entry `PathEv[]` built from the scenario's existing
  `localMargin`/`warehouseMargin` fields — only for `local_resale`/`refurbish`
  scenarios, which are the only ones with real margin data to cap against.
  `Step5Done.tsx` — awards `voucherEcoCredits` via the existing, unmodified
  `earnSeller()` on mount, idempotency-keyed by `` `return:${orderId}:${decision}` ``
  so a refresh never double-credits; shows a "+N EcoCredits" badge next to the
  existing CO₂-saved line, plus the insetting disclosure. `rewards/page.tsx` —
  one added disclosure line under the balance hero.

## Data contracts (new/changed)
```ts
// carbon-methodology.ts
type AvoidedEmissionsRoute = 'resell' | 'refurbish' | 'donate' | 'recycle';
function computeAvoidedEmissionsKg(category: ItemCategory, route: AvoidedEmissionsRoute, logisticsCarbonKg: number): number;

// carbon-vouchers.ts
const FUNDING_SHARE = 0.25;
interface ReturnVoucherResult { ecoCredits: number; co2SavedKg: number; factors: RoutingFactor[] }
function computeReturnVoucherCredits(category: ItemCategory, route: ReturnPath, freightAvoidedKg: number, paths: PathEv[]): ReturnVoucherResult | null;

// return.ts (additive)
interface ReturnRoutingDecision {
  // ...unchanged fields
  voucherEcoCredits?: number;
  voucherFactors?: RoutingFactor[];
}
```

## UI / behavior
- RETURN confirmation screen (`Step5Done.tsx`): a new "+N EcoCredits earned"
  badge appears next to the existing CO₂-saved badge for 1P items routed to
  `local_resale`/`refurbish` (the only scenarios with EV data to cap against
  in the current mock set); a one-line disclosure clarifies this is an
  internal insetting estimate, not a traded credit.
- Rewards page: same one-line disclosure added under the EcoCredits balance
  hero. No other UI changes — voucher tiers, redemption, and the activity
  ledger are untouched.

## Resolved decisions
1. 1P RETURN only this iteration (Track A); SELL/3P stays on the flat formula
   — avoids inventing a marketplace commission number.
2. Aggregate/statistical voucher-backing guarantee, not a strict per-item
   ledger redesign.
3. Amazon-facing aggregate dashboard deferred to spec 016 (needs a new
   persisted, cross-account routing-decision log that doesn't exist yet).
4. No `ProductHealthCard` field change this iteration.
5. `FUNDING_SHARE = 0.25`, reusing `routing-ev.ts`'s existing `CENTS_PER_KG_CO2`
   as the sole internal carbon price.

## Acceptance criteria
1. `pnpm -r typecheck` — green (strict, no `any`).
2. Regression: for the same `ItemCategory`, `estimateRouteImpact('recycle',
   …)` and the reuse baseline are independently sourced (not a fixed
   multiplier of each other) — confirms the methodology fix.
3. A 1P RETURN routed to `local_resale` or `refurbish` in the demo scenario
   set produces `voucherEcoCredits > 0` where none existed before; `Step5Done`
   shows the new badge; the Rewards page balance updates; a refresh of
   `Step5Done` does not double-award (idempotency key).
4. For any input, `voucherBudgetCents` never exceeds `carbonNarrativeCents`
   (the carbon-story cap) — verified by construction (the `min()` in
   `computeReturnVoucherCredits`).
5. `pnpm --filter web build` (dev server stopped) — green.
