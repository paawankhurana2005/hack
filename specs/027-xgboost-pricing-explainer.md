# 027 — XGBoost pricing model, explained

## Goal
A standalone explainer for the one ML model in the pricing stack — the XGBoost
warm-start reward predictor — pulled out of the full engine spec ([[014-dynamic-pricing]])
so it can be read (and diagrammed) on its own. No new code; this documents what
`ml/pricing/reloop_pricing/pricing/warmstart.py` already does. Companion diagram:
`reloop-xgboost-pricing.excalidraw` (importable at excalidraw.com — File → Open).

## Scope
**In:** what the model predicts, why XGBoost (vs. a neural net), the feature
vector, training hyperparameters, evaluation numbers from the v1 run, how it's
queried at inference, and how the retrain/promotion loop keeps it honest.
**Out:** the bandit's exploration math ([[014-dynamic-pricing]] §"Why XGBoost"
covers the split), guardrails, narration — those are downstream of this model,
not part of it.

## What the model predicts
One regression target: **E[reward | features, price_arm]** — the expected ₹
reward (margin − holding cost + carbon credit, or a reroute penalty; see
`reward.py`) if the item were listed at `comp_median_price × arm`. It is not a
policy — it doesn't choose a price. It's the perception step: "if we tried this
arm, what would we expect to get back?" The contextual bandit (Thompson
sampling) and deterministic guardrails do the choosing on top of these numbers.

## Why XGBoost, not a neural net
The state is a **flat 38–41-dim tabular vector** of named signals (grade
ordinal, days on market, comp count, view velocity — no images, no sequences,
no unstructured text). That's the regime gradient-boosted trees win
empirically over MLPs. Trees also hand us **SHAP importances** for free — a
defensible "why" for every prediction — need no GPU, and cold-start
reasonably on a few thousand rows. A neural function approximator only earns
its complexity with far more real transactions than a hackathon produces, and
the bandit already wraps any predictor implementing `predict_arm_rewards`, so
swapping later is mechanical, not architectural. Out of scope for this build.

## Feature vector — `build_feature_vector()`
The single source of truth for both training and inference (`ml/pricing/reloop_pricing/data/features.py`),
mirroring the TS `PricingStateVector` in `packages/shared/src/pricing/types.ts` so
the two can't drift. **38 base features**, grouped:

| Group | Count | Examples |
|---|---|---|
| Item identity | 12 | grade ordinal, original price (log), item age, damage score, defect count, category/brand (encoded) |
| Listing lifecycle | 5 | days on market, num reprices, current discount %, deadline pressure, is-first-listing |
| Demand signals | 7 | view velocity (24h + trend), save rate, CTR, message count, cart abandons, engagement composite |
| Competition | 6 | nearby comp count, comp median/min price (log), comp sold last 7d, avg days-to-sell, price vs. comp median |
| Geo / local | 3 | nearby buyer count, local supply count, geo demand index |
| Temporal | 5 | day-of-week + hour-of-day (sin/cos pairs), seasonality index |

Plus **3 arm features**, appended only when a candidate arm is supplied:
`price_arm_multiplier`, `candidate_price_log`, `candidate_margin_log` → **41-dim**
total. At inference the model is called once per arm with the same base
vector, so the arm tail is what lets one model score every price lever
(0.78× / 0.85× / 0.92× / 1.00× / 1.10×). Categoricals (`category_l1`,
`category_l2`, `brand`) go through `LabelEncoder`s saved alongside the model
so encode/decode can't skew between train and serve.

## Training — `WarmStartPricingModel.train()`
`xgboost.XGBRegressor` with:

```
n_estimators=500        max_depth=7            learning_rate=0.05
subsample=0.8           colsample_bytree=0.8   min_child_weight=5
reg_alpha=0.1           reg_lambda=1.0         early_stopping_rounds=50
eval_metric="mae"       tree_method="hist"     random_state=42
```

Depth 7 + shrinkage 0.05 + row/column subsampling is the standard
regularization triangle for a tabular regressor this size — deep enough to
capture interactions (e.g. grade × category × demand), shrunk and subsampled
enough not to memorize a few thousand rows. Early stopping on a held-out val
set (`eval_metric="mae"`) picks the actual tree count instead of trusting 500
blindly.

**Feature importance** is SHAP (`shap.TreeExplainer`, mean |SHAP| across a
500-row val sample) — the "defensible why" per feature, not just XGBoost's own
gain metric. Falls back to `feature_importances_` (gain) only if the `shap`
package is unavailable.

## Warm-start data — and the honest label
No real ReLoop reprice logs exist yet, so the first model is **warm-started**
on **Mercari Price Suggestion + eBay Electronics** (Kaggle; synthetic
schema-faithful stand-ins when the real files aren't downloaded). Each
catalogue row's observed sale price is treated as ground truth, and for each
of the 5 price arms a **logistic demand curve** simulates the reward that arm
would have produced (`_simulate_arm_reward` in `data/pipeline.py`):
`P(sale)` falls as the candidate price rises above the item's true clearing
price; `reward = P(sale) × (margin − holding_cost)`. Every eval artifact
carries the label verbatim: *"reward is simulated from sale prices via a
demand curve — real production accuracy requires ReLoop transaction logs."*
This is a prior to bootstrap the bandit, not a claim of production accuracy.

## Evaluation — v1 run (16,000 train / 4,000 val rows, 41-dim)
| Metric | Value |
|---|---|
| Val MAE | ₹19.72 |
| Val MAPE | 18.9% |
| Best iteration | 498 / 500 trees |

Top SHAP features: `original_price_log`, `price_arm_multiplier`,
`comp_median_price_log`, `candidate_margin_log`, `candidate_price_log`,
`comp_min_price_log`, `category_l2_encoded`, `brand_encoded`,
`grade_ordinal`, `grade_is_new` — the model leans hardest on price anchoring
and the arm/margin interaction, which is exactly the shape you'd want it to
learn (price the item relative to itself and its comps, not off unrelated
noise).

## Inference — `predict_arm_rewards(state)`
Called once per decision, from `PricingAgent.think` (`agent.py`) via the
bandit. Builds the 41-dim vector per arm through the same `build_feature_vector`,
batches a single `model.predict(X)` call over all 5 arms, and returns
`{arm: predicted_reward}`. The bandit adds Thompson-sampling exploration noise
on top (scaled to that decision's reward spread), guardrails clamp the result,
and the model itself never sees or influences the final price directly — it
only perceives.

## The retrain loop — how it stays honest over time
`LearningLoop.maybe_retrain` fires every 500 newly logged real
`(state, arm, reward)` rows (`retrain.py`):
1. Rebuild the synthetic warm-start backbone (2,000-row default sample) so a
   retrain never forgets the demand-curve prior.
2. Blend in the real logged rows, **upweighted by replication** to ~50% of
   the training set so real signal isn't diluted by the larger synthetic pool.
3. Train a candidate `WarmStartPricingModel` the same way as v1.
4. **Offline policy evaluation**: replay the real logged rows through the
   candidate vs. the current model; only `promote=True` if the candidate beats
   the incumbent by **>2%** on that replay.
5. On promotion: save `runs/warmstart/vN/`, update the `CURRENT` pointer, and
   the agent hot-swaps the new model into every bucket's bandit (exploration
   counts survive the swap).

No RL, no online gradient updates — it's supervised learning over a growing,
real-outcome dataset, gated by a measured offline win before it ever touches
live pricing. A representative marketplace-sim run (seed 7) fired one
promoted retrain at +21.5% and correctly **held** a later retrain at −0.8%,
proving the gate rejects as readily as it accepts.

## Diagram
`reloop-xgboost-pricing.excalidraw` (repo root) — import at excalidraw.com.
Bands top to bottom: data sources → feature engineering (38+3 dims) → XGBoost
training (hyperparameters + SHAP) → v1 evaluation numbers → per-arm inference
→ bandit/guardrails decision → the retrain/promotion loop.

## Resolved decisions / open questions
- This spec documents existing behavior; no code changed.
- Geo-as-bandit-dimension and real-transaction volume needed before the
  warm-start label can be dropped remain open (tracked in [[014-dynamic-pricing]]).
