# Spec 014 — Dynamic Pricing (event-driven reprice engine)

> Status: **Phase 0 landed** (shared contracts + guardrails + reward). Phases 1–7
> build the Python ML stack, API layer, and UI. This doc is the living record;
> update it as each phase ships.

## Goal
Give a resale listing a **dynamic, self-correcting price** that moves with the local
market — a comp sells, views slow, a deadline nears — instead of a single price set
once at listing time. The price is set by a **supervised reward model + contextual
bandit**, clamped by **deterministic guardrails**, and **narrated** by an LLM.

This is the RE-pricing loop. It is distinct from the one-shot sell-flow estimator
(`packages/shared/src/pricing.ts` + `pricing-model.ts`), which sets the FIRST price.
This engine takes over once the item is listed and reacts to market events.

## The inviolable rule (applies everywhere here)
> **The model PERCEIVES. Deterministic code DECIDES. The LLM only NARRATES.**

- XGBoost **predicts** E[reward | features, arm].
- The contextual bandit **selects** an arm (Thompson sampling adds calibrated exploration).
- Deterministic **guardrails** clamp the final price (floor / ceiling / step / rounding).
- An 8B LLM **narrates** the move in one sentence; a deterministic template is the fallback.

Every on-screen price is reproducible: "why ₹1,050?" → the exact rule + the exact
feature values that produced it.

## Why XGBoost (and why NOT a neural net)
The state is a **flat 38–41-dim tabular vector** of named signals (grade ordinal, days
on market, comp count, view velocity). That is the regime where **gradient-boosted trees
win** — empirically, tabular competitions go to XGBoost/LightGBM, not MLPs. Trees also
give us **SHAP feature importances** (the defensible "why"), cold-start well on little
data, and need no GPU. **The NN / DQN upgrade path is intentionally dropped** for this
build: a neural function approximator is only worth its complexity once we have far more
real transactions than a hackathon has, and it would buy us nothing on 41 tabular
features today. If that ever changes, the bandit wraps *any* predictor implementing
`predict_arm_rewards`, so the swap is mechanical — but it is out of scope here.

## Architecture (build order)
> Python lives under root `ml/pricing/` (importable package `reloop_pricing`),
> mirroring the existing `ml/grading/` — NOT `packages/ml/`, because `pnpm-workspace.yaml`
> globs `packages/*` and would try to treat a Python dir as a JS workspace.

```
Historical data (Mercari + eBay)
   → data pipeline + feature engineering  (ml/pricing/reloop_pricing/data/) ✅
   → XGBoost warm-start reward model       (ml/pricing/reloop_pricing/pricing/warmstart.py)
   → contextual bandit (Thompson sampling) (ml/pricing/reloop_pricing/pricing/bandit.py)
   → event-driven trigger + significance filter (apps/api/src/services/pricing/events.ts)
   → deterministic guardrails              (packages/shared/src/pricing/guardrails.ts) ✅
   → LLM narration + deterministic fallback (apps/api/src/services/pricing/narrate.ts)
   → transaction logger (state, arm, reward, outcome) → the Stage-2 training data
   → offline evaluator + promotion gate     (ml/pricing/reloop_pricing/pricing/evaluate.py)
```

## The reward function (ReLoop's thesis as math) ✅ landed
`packages/shared/src/pricing/reward.ts`, mirrored by `reward.py`:
- **sold** → `margin − holdingCost·days + carbonCreditIfLocal`
- **rerouted** → `−penalty` (warehouse worse than recycle — item moved, still no sale)
- **listed** → `0` (intermediate signal for partial credit, never terminal)

Pricing and routing share this one objective — `value − cost − holding + carbon`.

## Event significance filter + hybrid trigger
Most raw market events **die at the significance filter** (e.g. a comp lists but doesn't
undercut us by >5% → ignored). What survives wakes the engine. A **daily heartbeat** cron
is the staleness backstop so a quiet listing still gets re-evaluated. Production maps to
**EventBridge + SQS**; locally it's a typed in-process queue.

## Guardrails ✅ landed
`packages/shared/src/pricing/guardrails.ts`:
- hard floor = `max(sellerFloor, routeElsewhereValue)` → below it, **reroute** (don't price lower)
- ceiling = `amazonNewPrice × 0.95`
- max step = `min(₹100, 8% of current)` (skipped on first listing)
- round to nearest ₹50; re-check floor after rounding

> Money unit: this engine is **whole-rupee (INR)** native. Convert at the API boundary
> if a caller speaks paise.

## Data contracts (packages/shared/src/pricing/) ✅ landed
- `arms.ts` — `PRICE_ARMS` (0.78 / 0.85 / 0.92 / 1.0 / 1.1), `PriceArm`, `NEUTRAL_ARM`.
- `types.ts` — `PricingStateVector`, `PricingDecision`, `PricingOutcome`, `DemandEvent`,
  `DemandEventType`, `PricingReasonCode`, `BanditState`, `ContextBucket`,
  `SellThroughCurvePoint`, `GuardrailResult`.
  (Named `SellThroughCurvePoint` to avoid clashing with the sell-flow `SellThroughPoint`.)
- `reward.ts` — `RewardConfig`, `DEFAULT_REWARD_CONFIG`, `computeReward`.
- `guardrails.ts` — `applyGuardrails`, `GuardrailInput`, `GuardrailOutput`.

## Amazon service mapping (production intent)
- **EventBridge + SQS** — market event bus + significance-filtered queue.
- **SageMaker** — hosts the XGBoost reward model (same `predict_arm_rewards` contract).
- **Bedrock** (8B) — the one-sentence narration; deterministic template on failure.
- **DynamoDB / feature store** — per-bucket bandit state + the (state, arm, reward) log.

## Honest status
| Component | Status |
|---|---|
| Shared contracts (`pricing/`) | **Implemented** (Phase 0) |
| Guardrails | **Implemented** (Phase 0) |
| Reward function (TS) | **Implemented** (Phase 0) |
| Data pipeline + features (Python) | **Implemented** (Phase 1 — `ml/pricing/`) |
| XGBoost warm-start + SHAP eval | **Implemented** (Phase 2 — MAE 19.7 / MAPE 18.9% on synthetic) |
| Contextual bandit + 30-day sim | **Implemented** (Phase 3 — converges 38%→100% exploit) |
| Transaction logger + offline evaluator/promotion gate | **Implemented** (Phase 4 — gate fires both ways) |
| Event filter / engine / routes / narration | **Implemented** (Phase 5 — `/api/pricing/*`) |
| Sell-through curve UI + reprice demo page | **Implemented** (Phase 6 — `/reprice`) |
| End-to-end trace | **Implemented** (Phase 7 — `pnpm --filter api reprice:trace`) |
| Neural net / DQN | **Dropped on purpose** (tabular → trees) |

## Data sources + honest label
Warm-start trains on **Mercari Price Suggestion + eBay Electronics**, with reward
**simulated from observed sale prices** via a demand curve (no real reprice logs exist
yet). Every eval artifact must carry the label: *"measured on a synthetic simulation of
Mercari + eBay data — real production accuracy requires ReLoop transaction logs."*

## Resolved decisions
- **Pricing brain:** Thompson-sampling contextual bandit over a learned reward curve.
- **Signal source (first build):** simulated market event stream.
- **Posteriors:** pooled per `(category × grade)` bucket — network effects + warm cold-start.
- **Function approximator:** XGBoost only; NN/DQN dropped for this build.

## Open questions
- Geo as a posterior dimension vs. a feature-only signal (currently feature-only).
- Where bandit state persists in the demo (in-memory vs. the multi-account store).

## Acceptance criteria (Phase 0)
- [x] `packages/shared/src/pricing/` contracts compile under strict TS, no `any`.
- [x] `applyGuardrails` + `computeReward` exported via `@reloop/shared`.
- [x] `pnpm -r typecheck` green (shared, api, web).
- [x] This spec records the design, the XGBoost-only decision, and honest status.
