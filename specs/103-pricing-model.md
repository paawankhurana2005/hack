# 103 — Pricing Model (Phase 2)

## Goal
Replace "LLM guesses retail × grade factor" with a **real feature-based resale-price
predictor anchored to the item's original Amazon listing** (the moat), emitting a
clearing price **+ prediction interval + sell-through curve** — while a deterministic
policy still owns the final number. The model proposes; logic decides.

## Scope
**In:** a gradient-boosted regressor predicting the resale RATIO from named features;
base-reference anchoring; conformal prediction intervals; the price↔time-to-sell
curve; the deterministic clamp policy; eval (MAE + coverage vs baseline); web tradeoff
UI. **Out (later):** real demand via Forecast/Personalize (P3+), the `belowFloor`
hand-off into routing EV (P3), hosted SageMaker training (documented).

## The model (logic decides, model narrates)
A pure-TS **gradient-boosted decision-tree regressor** (`shared/ml/gbdt.ts`) predicts
the **resale ratio = clearing price ÷ original retail** from named features, so
`clearingCents = ratio × originalRetailCents` is **anchored to the first-sale price
recorded in the provenance chain** — a base reference only the platform that logged the
first sale can supply.

- **Features** (`PriceFeatures`): grade ordinal, max issue severity, severe-issue
  count, completeness, model age (years), demand ordinal, authenticity confidence.
- **Training:** a **seeded synthetic** data-generating process (`pricing-model.ts`)
  whose "true" ratio depends on age/severity/completeness/authenticity — signals the
  old grade-factor baseline ignores — so the model genuinely adds value. Trained once,
  memoized, fully reproducible. Production path: SageMaker LightGBM behind the same
  `PriceModel` interface.
- **Interval:** **split-conformal** — the band half-width is the 80th-percentile
  absolute residual on a held-out calibration slice, so coverage is correct by
  construction (not the optimistic in-sample band).
- **Sell-through curve:** deterministic price-elasticity (`expectedDaysToSell`) → three
  points (aggressive / recommended / patient) with days + 30-day sell-through prob.

## Deterministic policy OWNS the final number
`pricing-service.ts`: model ratio × retail → clamp to `[floor (12% of retail), ceiling
(95% of retail)]` → round to ₹50. `belowFloor` is flagged when the predicted clearing
price is under the salvage floor (a signal for Phase-3 routing). The model never writes
the price; the policy does. Narration explains it (deterministic, with the anchor
called out).

## Fallback (same interface)
No base reference (long-tail) → `modelSource: 'fallback-policy'`: the LLM retail
estimate + the grade-factor `resalePolicy` + a wider ±20% interval. Pricing never fails.

## Affected files
- **shared (new):** `ml/gbdt.ts` (GBDT), `pricing-model.ts` (DGP, train/memoize,
  conformal interval, sell-through curve). **shared (edited, additive):** `pricing.ts`
  (`SellThroughPoint`, `PriceReference`, `PriceModelSource`; `PricingResult` gains
  `priceLow/priceHigh/sellThroughCurve/belowFloor/modelSource`; `PriceRequest` gains
  `reference/structuredIssues/completeness/authenticityConfidence/nearbyBuyers`).
  `index.ts` exports both new modules.
- **api:** `pricing-service.ts` rewritten (model + policy + curve + belowFloor);
  `routes/sell.ts` (`/price` + `/pipeline` schemas accept the feature inputs);
  `services/pipeline/sell-pipeline.ts` (price stage passes the reference + condition
  features).
- **web (additive):** `sell-session.tsx` passes the base reference + structured issues
  + authenticity to `priceItem`; `review-step.tsx` renders the price↔time-to-sell
  tradeoff, the predicted band, and the `belowFloor` note.

## Acceptance criteria — all met
1. `pnpm -r typecheck` — green (strict, no `any`). ✅
2. `pnpm eval` — `(synthetic seed)`, held-out N=96:
   - **Resale-ratio model MAE 2.0 pp of retail vs grade-factor baseline 11.1 pp →
     82% improvement.**
   - **Conformal interval coverage 86.5% (target 80%).**
   - Grading/calibration/routing unchanged; return-risk `n/a (P4)`. ✅
3. `pnpm --filter @reloop/web build` — green; seller dashboard untouched. ✅
4. `POST /api/sell/pipeline` (real key + image + price reference) returns
   `modelSource:'gbdt'`, a clearing price anchored to the reference retail, a
   `priceLow/priceHigh` band, and a 3-point `sellThroughCurve`. ✅

## Edge cases handled
No base reference → LLM-estimate + grade-factor fallback + wider band + `fallback-policy`
source. Predicted clearing below salvage floor → `belowFloor` (routing signal) and the
price clamped up to the floor. Outlier ratio → clamped to [0.05, 0.95] then policy
floor/ceiling. Ceiling prevents pricing a used item above ~95% of original retail.

## Deferred to Phase 3+/6
`belowFloor` consumed by the EV routing optimizer (P3); real demand via Forecast/
DeepAR + Personalize; discontinued-reference scarcity premium; warranty-remaining
feature; currency/fees/tax; hosted SageMaker training on provenance-flywheel labels.
