# 101 — Foundation Rails for ML-Extensiveness (Phase 0)

## Goal
Build the rails that make later ML phases credible — pipeline orchestration, a
feature store, a single model-call choke point, an eval harness, and idempotency —
**without breaking the one inviolable rule:** *logic decides, the model narrates.*
Every decision stays deterministic, glass-box, and reproducible; every model call
gets a deterministic fallback. This phase is pure plumbing: nothing user-facing
changes, the seller dashboard (teammate-owned) is untouched, and every new
`packages/shared` contract is additive.

## Scope
**In:** the four rails + idempotency + this design note, demonstrated on the **Sell
server pipeline** (`grade → price → health-card` — the path with chained real model
calls). **Out:** any new ML model (those are Phases 1–6), the client UI, the seller
dashboard, and live-model eval.

### Decisions
1. **Orchestrator demo = Sell pipeline, server-side.** The working client flow in
   `sell-session.tsx` is left as-is; the pipeline is exposed as an additive endpoint.
2. **Eval = offline / deterministic.** No NVIDIA key, no network — it measures the
   deterministic layers + grading aggregation + fallbacks on a labelled **synthetic**
   seed. Live-VLM eval is the documented production path, not run here.
3. **Model wrapper adopted in one caller** — the pricing **market provider** (it has a
   genuine deterministic category fallback). Grading's per-image provider keeps
   throwing on failure **on purpose** (perception must not fabricate a grade); its
   fallback lives at the pipeline stage level instead.

### Conflicts found in the code (trusted the code, flagged here)
- **No single `grade → price → route` path exists.** Sell is `grade → price →
  health-card`; Return is `grade → route` (`computeRouting`). The orchestrator is
  therefore a **generic** staged runner, demonstrated on the Sell path.
- **The eval lives in `apps/api/src/eval/`, not `packages/shared`.** The deterministic
  engines it must measure (`computeRouting`, grading `aggregate`, the resale policy)
  live in `apps/api`, and `shared` cannot import app code. Putting the eval in `api`
  lets it measure the **real** engines with zero logic duplication (no drift), which
  the realism bar demands. The generic engines/contracts it relies on
  (`pipeline`, `features`, `idempotency`) do live in `shared`.

## Affected files
**New (shared, pure, dependency-free → runs on client + server):**
- `packages/shared/src/pipeline.ts` — `Stage<I,O>`, `runStage`, `runPipeline2/3`,
  `StageTrace`, `PipelineResult`. Per-stage timeout + bounded retries + **required**
  deterministic fallback; full trace.
- `packages/shared/src/features.ts` — `FeatureVector`, `FeatureSource`,
  `FEATURE_SPECS` registry, `buildFeatureVector`, `gradeToOrdinal`. Missing signals
  are `null`, never a silent `0`.
- `packages/shared/src/idempotency.ts` — `stableKey(...parts)`, a pure FNV-1a hash
  over canonical JSON. (Prod swaps to UUIDv5; the "same inputs → same key" contract
  is unchanged.)
- All three exported from `packages/shared/src/index.ts`.

**New (api):**
- `apps/api/src/lib/model-call.ts` — `callModel<T>(cfg, {request, parse, fallback,
  retries?, nudge?, calibrate?, timeoutMs?})`. The single choke point: timeout,
  retry-with-nudge, **required** fallback, and a calibration hook (identity in P0,
  the seam P1 fills).
- `apps/api/src/services/pipeline/sell-pipeline.ts` — `runSellPipeline(deps, req)`,
  the Sell flow composed on the generic runner with deterministic stage fallbacks.
- `apps/api/src/eval/{seed,metrics,run}.ts` — synthetic seed + metric functions +
  the `pnpm eval` CLI (writes `eval/report.json` at the repo root).

**Edited (additive / non-behavioural):**
- `packages/shared/src/sell.ts`, `pricing.ts` — optional `requestKey?` on
  `GradeRequest` / `PriceRequest`.
- `apps/api/src/services/pricing/pricing-service.ts` — extracted pure
  `clampRetail` + `resalePolicy` (the exact shipped policy, now reusable by eval +
  the pipeline fallback); `price()` rewired to use them.
- `apps/api/src/services/grading/grading-service.ts` — `aggregate` exported (so eval
  measures the real worst-angle rule).
- `apps/api/src/services/pricing/nvidia-market-provider.ts` — `estimate()` routed
  through `callModel`; `CATEGORY_DEFAULT_INR` exported for the pipeline fallback.
- `apps/api/src/routes/sell.ts` — additive `POST /api/sell/pipeline` (existing
  `/grade`, `/price`, `/health-card` unchanged).
- `apps/web/src/lib/provenance-store.ts` — idempotent-append guard
  (`isDuplicateOfLast`): a retry/cold-start re-fire of the most-recent event
  (same `type` + `at`) is dropped, so provenance is never double-written.
- `package.json` (root) + `apps/api/package.json` — `eval` script (root delegates to
  the API's existing `tsx`; no new root dependency). `.gitignore` — `/eval/report.json`.

## Data contracts (all additive)
`Stage`, `StageTrace`, `PipelineResult` (pipeline.ts); `FeatureVector`,
`FeatureSource`, `FeatureSpec`, `FEATURE_SPECS` (features.ts); `stableKey`
(idempotency.ts); optional `requestKey` on `GradeRequest` / `PriceRequest`. No
existing contract changed shape.

## Behaviour
- `POST /api/sell/pipeline` always returns `200` with
  `{ grading, pricing, card, trace, usedFallback }`. It degrades to deterministic
  fallbacks rather than failing, and the `trace` shows each stage's
  `ok | retried | fallback` status — the literal proof of "no screen fails because a
  model call did."

## Acceptance criteria — all met
1. `pnpm -r typecheck` — green (shared, api, web; strict, no `any`). ✅
2. `pnpm eval` (no key) writes `eval/report.json` and prints, **labelled
   `(synthetic seed)`**:
   - Grading aggregation (N=12): exact 100.0%, within-1 100.0%, **abstention 16.7%**.
   - Pricing policy (N=10): **MAE ₹186**, MAPE 5.3%, interval coverage `n/a until P2`.
   - Routing conformance (N=12): **100.0%**.
   - Return-risk: `n/a (Phase 4)`.
   These are the deterministic baseline later ML phases must beat. ✅
3. `pnpm --filter @reloop/web build` — green; client + seller dashboard untouched. ✅
4. `POST /api/sell/pipeline`:
   - real key + real image → `usedFallback:false`, all stages `ok`
     (grade `like-new` 0.9 @ 5.7s; price real @ 32s; card 3ms). ✅
   - model unreachable → `usedFallback:true`, grade `fallback` (conservative `fair`),
     price + card still `ok`, `200` with trace. ✅

## How this trains in production (the honest ML path)
- **Pipeline →** AWS **Step Functions**; stage traces → **CloudWatch**.
- **Feature store →** **SageMaker Feature Store** (the registry maps 1:1).
- **Eval →** the same metric functions run over **real** labelled rows harvested from
  the provenance flywheel (every `graded`/`sold`/`routed` event is a labelled
  example) instead of the synthetic seed; numbers stop being labelled "synthetic".
- **Model wrapper →** the `calibrate` hook hosts conformal / temperature scaling (P1);
  swap the NVIDIA call for **Bedrock** behind the same interface.

## Resolved decisions / open questions
- **Resolved:** generic orchestrator (not a hard-coded 3-call flow); eval in `api`;
  wrapper proven in the market provider; grading provider stays non-fabricating.
- **Deferred to later phases:** structured/calibrated grading output (P1), the
  feature-fed pricing regressor + intervals (P2), EV-based routing (P3), the
  return-risk classifier + AUC (P4), RAG/flywheel (P5), HITL + drift + the full
  edge-case matrix (P6).
