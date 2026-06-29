"""30-day convergence demo: watch the bandit explore early, then exploit the model's
best arm — and see the realized rewards (which become next-retrain training rows) climb.

    python -m reloop_pricing.pricing.simulate

Uses the trained warm-start model (runs/warmstart/v1) as the reward oracle and a hidden
market that returns realized reward = model prediction + noise. Listings share ONE
context bucket (pooled posteriors), so every outcome teaches the whole bucket.
"""

from __future__ import annotations

import os

import numpy as np

from .bandit import ARMS, ContextualBandit
from .warmstart import WarmStartPricingModel

MODEL_DIR = "runs/warmstart/v1"
LISTINGS_PER_DAY = 8
DAYS = 30


def representative_state() -> dict:
    """A 'good'-grade smartphone listing — the context bucket we simulate."""
    return {
        "grade_ordinal": 3,
        "category_l1": "Electronics",
        "category_l2": "Cell Phones",
        "brand": "Apple",
        "original_price": 25000,
        "comp_median_price": 18000,
        "current_price": 18000,
        "floor": 9000,
        "item_age_days": 540,
        "has_accessories": 1,
        "authenticity_score": 0.95,
        "damage_score": 0.15,
        "defect_count": 1,
        "days_on_market": 4,
        "view_velocity_24h": 6,
        "comp_count_nearby": 4,
        "nearby_buyer_count": 7,
        "geo_demand_index": 0.6,
    }


def main() -> None:
    if not os.path.exists(f"{MODEL_DIR}/xgboost_model.json"):
        raise SystemExit(f"No model at {MODEL_DIR} — run train_warmstart first.")

    model = WarmStartPricingModel.load(MODEL_DIR)
    state = representative_state()
    anchor = state["comp_median_price"]
    floor = state["floor"]
    ceiling = 25000 * 0.95  # amazonNewPrice × 0.95

    # The model's static best arm — what the bandit should converge to.
    predicted = model.predict_arm_rewards(state)
    oracle_arm = max(predicted, key=predicted.get)
    oracle_reward = predicted[oracle_arm]

    rng = np.random.default_rng(0)
    bandit = ContextualBandit(model, rng=rng)
    spread = max(predicted.values()) - min(predicted.values())

    print("=== Phase 3 — 30-Day Bandit Convergence ===")
    print(f"Context bucket    : Electronics / good  (anchor ₹{anchor:,}, floor ₹{floor:,})")
    print("Model reward/arm  : " + ", ".join(f"{a}:₹{predicted[a]:.0f}" for a in ARMS))
    print(f"Model-best arm    : {oracle_arm}  (≈₹{oracle_reward:.0f})  ← bandit should settle here")
    print(f"\n{'Day':>3} | {'arm picks (0.78→1.10)':<26} | {'avg ₹reward':>11} | exploit%")
    print("-" * 62)

    for day in range(1, DAYS + 1):
        counts = {a: 0 for a in ARMS}
        rewards, exploits = [], 0
        for _ in range(LISTINGS_PER_DAY):
            decision = bandit.decide(state, anchor, floor, ceiling)
            arm = decision["chosen_arm"]
            # hidden market: realized reward = model prediction + market noise
            realized = predicted[arm] + float(rng.normal(0, 0.12 * spread))
            bandit.update(arm, realized)
            counts[arm] += 1
            rewards.append(realized)
            exploits += int(arm == oracle_arm)

        if day <= 6 or day % 5 == 0:
            hist = " ".join(f"{counts[a]}" for a in ARMS)
            bar = "".join("█" if a == oracle_arm else "·" for a in ARMS for _ in range(counts[a]))
            print(f"{day:>3} | {hist:<10} {bar:<15} | {np.mean(rewards):>10.0f} | {exploits / LISTINGS_PER_DAY:>5.0%}")

    print("-" * 62)
    print("Early days spread picks across arms (exploration); later days collapse onto")
    print(f"the model-best arm {oracle_arm} (exploitation). Final arm counts: "
          + ", ".join(f"{a}:{bandit.arm_observations[a]}" for a in ARMS))
    print("\nEvery realized reward above is one logged training row. At ~500 rows the")
    print("model retrains — THAT is how a wrong model gets corrected. No RL.")


if __name__ == "__main__":
    main()
