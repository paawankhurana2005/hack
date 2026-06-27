# 105 — Prevention as a Real Return-Risk Model (Phase 4)

## Goal
Turn the 4th pillar from a static catalog lookup into a real **return-risk classifier**
at the point of purchase: predict `P(return)` for a specific product VARIANT from named
features, plus a reason distribution, and drive a deterministic nudge. Model predicts;
logic acts. The stable `ReturnRiskPrediction` contract is unchanged.

## The model (logic acts on the prediction)
A real **logistic-regression classifier** (`shared/ml/logreg.ts`, batch GD + L2,
deterministic) predicts `P(return)` from `RiskFeatures`
(`shared/return-risk-model.ts`):
- **Features:** category return prior, sized-variant flag, **size extremity** (distance
  from the median size offered), price band, **rating deficit** (review-quality proxy),
  and the **signed-in user's own** past return propensity (privacy-safe — never other
  users'). Trained on a seeded synthetic DGP; same interface as a hosted
  SageMaker/Personalize model in prod.
- **Deterministic policy:** `riskLevelFor(p)` → low/moderate/high bands;
  `confidenceFor(ratingCount)` → history-backed confidence; `reasonDistribution(f)` →
  a glass-box reason split (Runs small/large · Wrong fit · Quality/defect · Changed
  mind). The cross-variant **nudge** recommends the lowest-risk size when it's
  meaningfully safer (≥5pp).

## Integration (authored labels first, model everywhere else)
`apps/web/src/lib/prevention.ts` `getReturnRisk(productId, variant)`: returns the
curated authored prediction when present (real historical labels for the hero shoe —
keeps the demo exact), otherwise the **classifier generalizes prevention to every
sized product** (previously only the hero had predictions). Null when there's no
variant to reason about. The store detail page now routes through `getReturnRisk`, so
the prevention panel + safer-variant switch work for all sized products.

## Affected files
- **shared (new):** `ml/logreg.ts` (logistic regression + `auc`), `return-risk-model.ts`
  (features, DGP, train/memoize, predict, level/confidence/reasons). `index.ts` exports
  both. No contract change to `prevention.ts` (the surface is stable).
- **web:** `lib/prevention.ts` (model-fill + cross-variant nudge, authored-first);
  `app/app/store/[productId]/page.tsx` (uses `getReturnRisk`).
- **api eval:** `metrics.ts` + `run.ts` — return-risk AUC vs a category-prior baseline.

## Acceptance criteria — all met
1. `pnpm -r typecheck` — green (strict, no `any`). ✅
2. `pnpm eval` — `(synthetic seed)`, held-out N=120:
   **return-risk classifier AUC 0.728 vs category-prior baseline 0.673** — the model
   beats the prior. All earlier phase metrics unchanged. ✅
3. `pnpm --filter @reloop/web build` — green; seller dashboard untouched. ✅
4. The store detail page shows a model-driven return-risk panel (P(return) + reason
   distribution + safer-variant nudge) for any sized product; the hero shoe keeps its
   curated authored prediction. ✅

## Edge cases handled
Brand-new / thin-history product → `confidenceFor(ratingCount)` lowers confidence
(priors dominate). Non-sized product → null (no variant to predict). Sparse customer
history → neutral user-propensity prior (0.15). Privacy → only the signed-in user's own
return rate is ever a feature. Conflicting signals → the deterministic reason split and
the ≥5pp nudge threshold avoid over-nudging.

## Deferred to Phase 6
Real Personalize buyer/return-propensity + Comprehend review-sentiment features; a
hosted SageMaker classifier with Model Monitor drift; richer reason taxonomy; using the
user's own return history from the return store as the propensity feature.
