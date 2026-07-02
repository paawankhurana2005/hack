# ReLoop Dynamic Pricing — Technical Implementation Report (Spec 014)

> The event-driven re-pricing engine: **XGBoost reward model + Thompson-sampling bandit, no RL.**
> Two moving parts, one job each, learning by supervised retrain on a growing dataset.

---

## 1. What was built, in one paragraph

An **event-driven re-pricing engine** for already-listed resale items. When a market event
fires (a comp sells, views slow, a deadline nears), the engine wakes, an **XGBoost reward
model** predicts the expected ₹-reward for each of 5 candidate prices, a **Thompson-sampling
contextual bandit** picks one (exploring when uncertain), **deterministic guardrails** clamp
the final number, and an **LLM narrates** it (with a deterministic template fallback). Every
outcome is logged as a supervised training row; at ~500 rows the model retrains, gated by
**offline policy evaluation**. This is distinct from the existing one-shot sell-flow
estimator — that sets the *first* price; this runs the *re-pricing loop* after listing.

The governing rule, enforced at every layer:
**the model PERCEIVES, deterministic code DECIDES, the LLM only NARRATES.**
No reinforcement learning anywhere — the "learning" is supervised learning over a growing dataset.

---

## 2. The two moving parts (the mental model)

| Part | Role | Properties |
|---|---|---|
| **XGBoost** | Looks at the 41-dim feature vector, predicts `E[reward \| features, arm]` | Static once trained; improves only by retraining on more data |
| **Thompson bandit** | Looks at XGBoost's predictions, adds calibrated exploration noise | Not RL, not a net — a statistician that says "I'm uncertain, let me try" |

The bandit never overrides the model's reward *estimates* — it only adds exploration. A wrong
model gets corrected **offline** (retrain on logged outcomes), never online. That's the honest,
stable, defensible version of "RL-like."

### Why XGBoost (and why NOT a neural net)
The state is a flat **38–41-dim tabular vector** of named signals (grade ordinal, days on
market, comp count, view velocity). That is the regime where **gradient-boosted trees win** —
empirically, tabular competitions go to XGBoost/LightGBM, not MLPs. Trees also give **SHAP
feature importances** (the defensible "why"), cold-start well on little data, and need no GPU.
**NN / DQN are intentionally dropped**: a neural function approximator is only worth its
complexity at far more data than a hackathon has, and buys nothing on 41 tabular features. The
bandit wraps *any* predictor, so the swap stays mechanical if that ever changes.

### The "learning loop", honestly told
```
Mercari + eBay warm-start  →  XGBoost v1 deployed
        ↓  real reprice decisions + outcomes accumulate (one training row each)
  500 rows  →  retrain  →  XGBoost v2   (now knows: low saves + 8 days = price lower from day 3)
 2000 rows  →  retrain  →  XGBoost v3   (now knows: iPhone 13 / good / Bengaluru / Dec = hold)
        ↓  keeps compounding
```
That is supervised learning with a growing dataset. It is not called RL because it is not RL.

---

## 3. Architecture & data flow

```
market event ─▶ significance filter ─▶ reward model ─▶ bandit ─▶ guardrails ─▶ narration
                  (most events die)      (XGBoost or       (Thompson)   (floor/ceiling/   (LLM +
                                          heuristic)                     step/round)       fallback)
                                                                                              │
                                          outcome logged ◀── reward = margin−holding+carbon ◀─┘
                                                │
                                          ~500 rows ─▶ retrain ─▶ offline eval gate ─▶ promote
```

Three deployment surfaces:
- **`packages/shared/src/pricing/`** — TypeScript data contracts + deterministic guardrails/reward (shared by API and web).
- **`ml/pricing/`** — the Python ML stack (training, bandit, eval, model server).
- **`apps/api` + `apps/web`** — the runtime engine, routes, and demo UI.

---

## 4. Layer 1 — Shared contracts (`packages/shared/src/pricing/`)

Strict TypeScript, no `any`, ESM `.js` imports, wired into the `@reloop/shared` barrel.

**`arms.ts`** — the discrete action space, single source of truth:
```ts
export const PRICE_ARMS = [0.78, 0.85, 0.92, 1.0, 1.1] as const; // multipliers on the comp-median anchor
export type PriceArm = (typeof PRICE_ARMS)[number];
export const NEUTRAL_ARM: PriceArm = 0.92;
```
A small fixed action set is what makes pricing reproducible and explainable ("we chose 0.92×
the local median").

**`types.ts`** — `PricingStateVector` (item identity, lifecycle, demand, competition, geo,
seller constraints, temporal), `PricingDecision`, `PricingOutcome`, `DemandEvent` /
`DemandEventType`, `PricingReasonCode`, `BanditState`, `ContextBucket`, `GuardrailResult`,
`SellThroughCurvePoint`.

**`reward.ts`** — ReLoop's thesis as math (the quantity XGBoost learns):
```
sold     → margin − holdingCost·days + carbonCreditIfLocal
rerouted → −penalty   (warehouse worse than recycle)
listed   → 0          (intermediate, never terminal)
```
`DEFAULT_REWARD_CONFIG`: handling ₹120/txn, holding ₹8/day, carbon ₹45, warehouse −₹200, recycle −₹100.

**`guardrails.ts`** — `applyGuardrails()`, the deterministic clamp every model output passes through:
1. floor = `max(sellerFloor, routeElsewhereValue)` → **below it, reroute** (hand to the Intelligent Bridge, don't price lower)
2. ceiling = `amazonNewPrice × 0.95`
3. max step = `min(₹100, 8% of current)` (skipped on first listing)
4. round to nearest ₹50, re-check floor

**Two deliberate adaptations to the codebase:**
- Renamed the curve type to **`SellThroughCurvePoint`** because `pricing.ts` already exports a
  `SellThroughPoint` of a different shape, and the `export *` barrel would have silently clobbered it.
- The engine is **whole-rupee (INR) native** (the ₹50/₹100/8% rules are rupee semantics) while the
  rest of the app stores money in paise — documented as a boundary to convert at the API edge.

---

## 5. Layer 2 — Python ML stack (`ml/pricing/`, package `reloop_pricing`)

Placed under root `ml/` (mirroring the existing `ml/grading/`) rather than `packages/ml/`,
because `pnpm-workspace.yaml` globs `packages/*` and would try to treat a Python dir as a JS workspace.

### 5a. Feature engineering (`data/features.py`) — the one source of truth
`build_feature_vector(row, arm, encoders)` produces **38 base features + 3 arm features = 41
dims**, mirroring the TS `PricingStateVector`. Training and inference call the *identical*
function, so they can't drift. Includes label-encoded categoricals, log-scaled prices, an
engagement composite, sin/cos cyclical temporals, and per-arm candidate-price/margin features
appended only when an arm is supplied. Grade convention here is **5=new … 1=poor** (internally
consistent across Python; documented as the inverse of the other module's `gradeToOrdinal`).

### 5b. Data pipeline (`data/mercari.py`, `data/ebay.py`, `data/pipeline.py`)
Real Kaggle loaders **plus schema-faithful synthetic generators** (condition-aware log-normal
prices), so the pipeline runs end-to-end today without the downloads. The **warm-start trick**:
each catalogue row's observed sale price is treated as its true clearing price, and for each of
the 5 arms a **logistic demand curve** simulates the reward — yielding `rows × 5` training
examples that teach the price→reward shape before a single real transaction.

**Verified run:** 1,000 catalogue rows → 5,000 examples (4k train / 1k val), feature dim 41,
all 5 grade ordinals present, rewards −₹77 → ₹14.5k.

### 5c. XGBoost warm-start (`pricing/warmstart.py`, `pricing/reward.py`, `pricing/train_warmstart.py`)
`XGBRegressor` (500 trees, depth 7, lr 0.05, early stopping) predicting reward per arm. The
model **carries its own label encoders**, so `predict_arm_rewards(state)` needs only a raw state
dict (features rebuilt through the shared builder). SHAP `TreeExplainer` gives the defensible "why."

**Verified:** Val **MAE 19.7 / MAPE 18.9%**; top SHAP features `original_price_log`,
`price_arm_multiplier`, `comp_median_price_log` — exactly what the demand-curve simulation
should produce. Eval artifact → `runs/warmstart/v1/eval_results.json` with the honest
synthetic-data label. (`reward.py` mirrors `reward.ts` 1:1 as a dataclass.)

### 5d. Contextual bandit (`pricing/bandit.py`, `pricing/simulate.py`)
Thompson sampling: `sigma(arm) = EXPLORE_FRACTION × reward_spread / sqrt(n_obs(arm))`.
**Critical calibration** — the naive fixed `0.15` assumes rewards in [0,1], but ours are ₹
margins (hundreds–thousands), so the noise is **scaled to the per-decision reward spread**,
otherwise exploration would be negligible. Posteriors pooled per `(category × grade)` bucket.
`update()` only increments observation counts (shrinks exploration); it does **not** touch
reward estimates — the model is static between retrains.

**Verified (30-day sim):** the bandit converges from **38% → 100% exploitation** of the
model-best arm, realized reward climbing to the oracle's ₹10,148.

### 5e. Logger + offline gate (`pricing/logger.py`, `pricing/evaluate.py`)
`TransactionLogger` appends `(state, arm, reward, outcome)` JSONL — the next-retrain training
data (`ready_to_retrain(every=500)`). `offline_policy_evaluation()` replays the logged history
through a candidate vs. current model (inverse-propensity-style estimate) and **only promotes on
>2% improvement**.

**Verified:** strong candidate vs weak current → **PROMOTE +4.0%**; candidate vs itself →
**HOLD 0.0%**. The gate fires both ways.

### 5f. Model server (`serve.py`)
Stdlib `http.server` (no Flask/uvicorn dependency). `POST /predict {state, arms}` →
`{rewards, modelVersion}`. Two subtleties handled:
- **Key mapping** camelCase `PricingStateVector` → snake_case feature row, deriving raw values
  (`original_price = expm1(originalPriceLog)`, `current_price = compMedian × (1 − discount)`,
  `floor = max(sellerFloor, routeElsewhereValue)`).
- **JS-compatible reward keys**: `_js_num()` emits `"1"` (not Python's `"1.0"`) so JS
  `String(arm)` lookups match.

---

## 6. Layer 3 — API runtime (`apps/api`)

New files alongside the existing sell-flow `pricing-service.ts` (distinct names, no collision):

- **`reward-model.ts`** — `RewardModel` interface with `HeuristicRewardModel` (deterministic
  in-TS logistic demand curve, mirroring the warm-start) and `HttpRewardModel` (calls the Python
  server, **falls back to heuristic on any error**). So the API runs with zero Python dependency,
  and `PRICING_MODEL_URL` upgrades it to the real model.
- **`reprice-bandit.ts`** — TS mirror of the Python bandit (Box–Muller Gaussian, pooled
  posteriors in an in-memory `Map`, `snapshot()` for dashboards).
- **`reprice-events.ts`** — the significance filter (`isSignificant`) + `PricingEventQueue` (SQS
  stand-in). Most events die here: a comp listing only matters if it undercuts by >5%; a velocity
  drop must be sustained; dwell only at milestones [3,7,14,21]; heartbeat/initial always pass.
- **`reprice-narrate.ts`** — deterministic template (always correct, reproducible from the
  decision's own numbers) + optional LLM rephrase that never throws.
- **`reprice-engine.ts`** — the orchestrator: `fillState()` defaults a partial state, then
  `predict → bandit.decide → applyGuardrails → narrate`, stores last decision per listing, and
  `logOutcome()` computes reward + updates the bandit.
- **`routes/pricing.ts`** — `POST /api/pricing/decide`, `POST /api/pricing/outcome`,
  `GET /api/pricing/state/:listingId` (zod-validated), wired in `index.ts` with model-source
  selection via `PRICING_MODEL_URL`.

**Verified (live curl):** initial listing → arm 0.78 → guardrail `round_to_50` → narrated;
significant comp reprice → `max_step_change` applied; sale outcome → reward **₹15,177**
(15300 − 120 handling − 48 holding + 45 carbon ✓) → bandit posterior updated.

---

## 7. Layer 4 — Web UI (`apps/web`)

- **`lib/api-client.ts`** — added `decidePricing()` + `PricingDecideRequest` type.
- **`components/pricing/sell-through-curve.tsx`** — renders the price↔time-to-sell tradeoff per
  arm, recommended highlighted, using existing design tokens. Every number comes from the returned
  `PricingDecision` — nothing invented client-side.
- **`app/reprice/page.tsx`** — a self-contained demo surface: pick a condition, fire any market
  event, and see the final price, narration, guardrails, **predicted reward per arm** (what the
  model sees), and the sell-through curve.

**Verified:** builds as a static 4.55 kB route; doesn't touch the existing sell flow.

---

## 8. Layer 5 — End-to-end integration (`apps/api/src/scripts/reprice-trace.ts`)

`pnpm --filter api reprice:trace` drives one listing through its full lifecycle. **Verified
output** showed: a `comp_listed @₹17500` event **dropped by the significance filter** (only 2.8%
under median) while `@₹15000` (undercut >5%) woke the engine; guardrails clamping each step; the
sale outcome producing reward ₹15,153 and incrementing the bandit's 0.85-arm posterior 0→1.

---

## 9. Verification summary (every claim is a tested artifact)

| Layer | Check | Result |
|---|---|---|
| Shared | `pnpm -r typecheck` | ✅ green (shared/api/web) |
| Python data | pipeline on 1k sample | 5k examples, dim 41 ✅ |
| XGBoost | warm-start eval | MAE 19.7 / MAPE 18.9% ✅ |
| Bandit | 30-day sim | 38%→100% exploit ✅ |
| Gate | offline eval | PROMOTE +4.0% / HOLD 0.0% ✅ |
| API | live decide/outcome/state | reward math exact ✅ |
| Model server | API→server→model | `xgboost-http`, real rewards ✅ |
| Web | production build | `/reprice` static 4.55 kB ✅ |
| Deploy gate | `pnpm --filter web build` | ✅ (dev server stopped) |

---

## 10. How to run it

```bash
# Train the warm-start model  (mac: brew install libomp — xgboost needs OpenMP)
cd ml/pricing
python3 -m reloop_pricing.pricing.train_warmstart --sample 4000 --output runs/warmstart/v1

# Watch the bandit converge / see the gate fire
python3 -m reloop_pricing.pricing.simulate
python3 -m reloop_pricing.pricing.evaluate

# Run the FULL autonomous agent over a marketplace (retrain + promote fire mid-run)
python3 -m reloop_pricing.pricing.simulate_marketplace --listings 200 --days 60 --seed 7

# Serve the real model, point the API at it
python3 serve.py                                       # :8001
PRICING_MODEL_URL=http://127.0.0.1:8001  <start api>   # else deterministic in-TS model

# End-to-end trace
pnpm --filter api reprice:trace
```

API endpoints:
```
POST /api/pricing/decide          { listingId, event:{type,payload}, state:{...} } → PricingDecision
POST /api/pricing/outcome         { listingId, arm, finalPrice, sold, daysOnMarket, ... } → { reward, ... }
GET  /api/pricing/state/:listingId → BanditState (pooled posteriors)
```

---

## 10a. From decision function to autonomous agent (Phase 8)

Sections 1–10 describe the decision **brain**. It only acted when called, kept no memory,
and never retrained itself. Phase 8 turns it into an **agent** — the same math, now with a
loop, memory, and a self-closing learning loop. Files under `ml/pricing/reloop_pricing/pricing/`:

- **`agent.py` — `PricingAgent`.** Runs the agentic cycle: `sense` (significance gate) →
  `think` (model → `BucketedBandit` → guardrails) → `act` (reprice/reroute/hold) → `reflect`
  (emits the same `pricing.decide` JSON the TS engine does, + a one-line narration) →
  `learn` (reward → bandit update → persist → maybe retrain + hot-swap).
- **`memory.py` — `AgentMemory`.** The part that makes it "learning": JSONL transaction log
  (the next-retrain dataset) + per-`(category × grade)` bandit posteriors, both file-backed
  so exploration and data **survive a restart** and compound.
- **`bandit.py` — `BucketedBandit`.** One Thompson posterior per cohort (mirrors the TS
  `RepriceBandit` pooling); hot-swappable predictor via `set_predictor` so a promoted retrain
  updates every bucket without losing its exploration counts.
- **`retrain.py` — `retrain_from_logger` + `LearningLoop`.** Closes the loop nobody had
  wired: at 500 fresh rows, blend the synthetic warm-start backbone with the **real logged
  (state, arm, reward) rows**, train a candidate, gate with `offline_policy_evaluation`, and
  promote only on a **>2% offline win** → hot-swap the live model, bump the version, update a
  `runs/warmstart/CURRENT` pointer. No RL — supervised learning on a growing dataset, gated.
- **`guardrails.py` / `significance.py`.** 1:1 Python mirrors of the TS `guardrails.ts` /
  `events.ts` (same convention as `reward.py`), so the offline sim clamps and filters exactly
  like the live engine.

### The marketplace simulation — proof it does everything, in real time

`simulate_marketplace.py` stands up a diverse, self-refilling marketplace and runs the full
agent loop against a **hidden ground-truth demand world (`MarketWorld`) deliberately
different from the model's warm-start belief** — some cohorts clear above the prior, some
below, plus per-item idiosyncrasy. Because the model is systematically wrong for whole
cohorts, the *only* way its predictions improve is by gathering real outcomes and
retraining. That is the honest engine of "it gets smarter" — no scripted win.

```bash
cd ml/pricing
python3 -m reloop_pricing.pricing.simulate_marketplace --listings 200 --days 60 --seed 7
# → runs/sim/trace.jsonl   (every pricing.decide / pricing.outcome / pricing.retrain line)
# → runs/sim/report.json   + runs/sim/summary.md
```

Representative run (seed 7): **6,715 decisions · 973 terminal outcomes · 50% of listing-days
held** (calm cadence), every event type + every reachable guardrail exercised, reroutes
across **donate / recycle / warehouse**, and one **offline-gated retrain promoted**
(candidate ₹2,839 vs incumbent ₹2,336 → **+21.5%** → v2). Emergent-and-correct: the
`electronics` cohort — which the hidden world makes clear *above* the prior — is where the
agent's posteriors and the retrain both push, exactly as a correct learner should.

`runs/sim/trace.jsonl` is the judge-facing "everything it's thinking" log; each line is
CloudWatch-shaped JSON, identical in schema to what the live API emits, so on AWS the same
query spans the simulator and production. The API side (`reprice-engine.ts`) now emits
`pricing.outcome` and a `pricing.retrain_due` signal every 500 rows to match.

---

## 11. Honesty & scope notes

- **Reward is simulated** from Mercari+eBay sale prices via a demand curve until real reprice logs
  exist — that label is printed by every script and written into `specs/014-dynamic-pricing.md`.
- **NN/DQN deliberately dropped** — tabular features are the regime where trees win; a neural net
  would add complexity and buy nothing at this data scale.
- **Trained artifacts are gitignored** (`runs/`, `*.npy`) — the repo ships source; you train locally.

---

## 12. File manifest

```
packages/shared/src/pricing/
  arms.ts            PRICE_ARMS, PriceArm, NEUTRAL_ARM
  types.ts           PricingStateVector, PricingDecision, PricingOutcome, DemandEvent, BanditState, …
  reward.ts          RewardConfig, DEFAULT_REWARD_CONFIG, computeReward
  guardrails.ts      applyGuardrails (floor→reroute, ceiling, step cap, ₹50 round)
  index.ts           barrel  (wired into ../index.ts)

ml/pricing/                       (package: reloop_pricing)
  requirements.txt   numpy, pandas, scikit-learn, xgboost, shap
  serve.py           stdlib HTTP /predict, /health
  reloop_pricing/data/
    features.py      build_feature_vector — the ONE source of truth (41-dim)
    mercari.py       loader + synthetic_mercari
    ebay.py          loader + synthetic_ebay
    pipeline.py      build_training_dataset (rows × 5 arms → simulated reward)
  reloop_pricing/pricing/
    reward.py        mirror of reward.ts
    warmstart.py     WarmStartPricingModel (XGBoost + SHAP)
    train_warmstart.py
    bandit.py        ContextualBandit + BucketedBandit (per-cohort, hot-swappable predictor)
    simulate.py      30-day convergence demo
    logger.py        TransactionLogger (JSONL, retrain trigger)
    evaluate.py      offline_policy_evaluation + promotion gate
    guardrails.py    mirror of guardrails.ts (Phase 8)
    significance.py  mirror of events.ts isSignificant (Phase 8)
    memory.py        AgentMemory — persistent transactions + bandit posteriors (Phase 8)
    retrain.py       retrain_from_logger + LearningLoop (log→retrain@500→eval→promote→swap)
    agent.py         PricingAgent — sense/think/act/reflect/learn (Phase 8)
    simulate_marketplace.py  MarketWorld hidden truth + full-loop marketplace sim (Phase 8)

apps/api/src/
  services/pricing/reward-model.ts    HeuristicRewardModel + HttpRewardModel
  services/pricing/reprice-bandit.ts  TS Thompson bandit (pooled posteriors)
  services/pricing/reprice-events.ts  significance filter + queue
  services/pricing/reprice-narrate.ts narration + deterministic fallback
  services/pricing/reprice-engine.ts  orchestrator (decide / logOutcome / getBanditState)
  routes/pricing.ts                   /api/pricing/{decide,outcome,state}
  scripts/reprice-trace.ts            end-to-end trace  (pnpm --filter api reprice:trace)
  index.ts                            wiring (PRICING_MODEL_URL selects model source)

apps/web/src/
  lib/api-client.ts                   decidePricing()
  components/pricing/sell-through-curve.tsx
  app/reprice/page.tsx                demo surface

specs/014-dynamic-pricing.md          living spec (design, decisions, honest status table)
```

---

## 13. Git

Committed as `01930d2` (36 files, +2,602) and pushed to `origin/feat/ml-extensiveness-p0-p6`.
The commit contains **only** the dynamic-pricing work; pre-existing unrelated changes (grading
leniency shim, `sell-session.tsx`, `ml/grading/TECHNICAL.md`, colab zip) were left untouched in
the working tree.
