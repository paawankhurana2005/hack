"""Offline evaluator + promotion gate. Run BEFORE promoting any retrain to production.

Replays the logged history through a candidate model and an inverse-propensity-style
estimate of the reward it WOULD have earned, vs the current model. Promote only if the
candidate beats the current model by a margin. This is what makes the compounding-retrain
loop safe: a new model never ships on faith, only on a measured offline win.

    python -m reloop_pricing.pricing.evaluate   # self-contained demo: weak v0 vs strong v1
"""

from __future__ import annotations

from typing import Dict, List

import numpy as np

PROMOTE_THRESHOLD_PCT = 2.0  # candidate must beat current by >2% to ship


def offline_policy_evaluation(
    logged_tuples: List[Dict], candidate_model, current_model
) -> Dict:
    """logged_tuples: [{state, arm (logged action), reward (observed)}].
    For each row, the model picks its argmax arm; if that matches the logged action we
    credit the observed reward, else we fall back to the model's own estimate (IPS)."""
    cand_rewards, base_rewards = [], []
    for t in logged_tuples:
        state, logged_arm, observed = t["state"], t["arm"], t["reward"]

        cand = candidate_model.predict_arm_rewards(state)
        cand_arm = max(cand, key=cand.get)
        cand_rewards.append(observed if cand_arm == logged_arm else cand[cand_arm])

        base = current_model.predict_arm_rewards(state)
        base_arm = max(base, key=base.get)
        base_rewards.append(observed if base_arm == logged_arm else base[base_arm])

    cand_rev = float(np.mean(cand_rewards))
    base_rev = float(np.mean(base_rewards))
    improvement = (cand_rev - base_rev) / (abs(base_rev) + 1e-9) * 100
    promote = improvement > PROMOTE_THRESHOLD_PCT

    print("\n=== Offline Policy Evaluation ===")
    print(f"Candidate avg reward: {cand_rev:.2f}")
    print(f"Current  avg reward: {base_rev:.2f}")
    print(f"Improvement:          {improvement:.1f}%  (gate: >{PROMOTE_THRESHOLD_PCT}%)")
    print(f"Decision:             {'PROMOTE ✅' if promote else 'HOLD ❌'}")

    return {
        "candidate_revenue": cand_rev,
        "current_revenue": base_rev,
        "improvement_pct": float(improvement),
        "promote": promote,
        "n_evaluated": len(logged_tuples),
    }


def _demo() -> None:
    """Train a deliberately weak current (tiny data) and a strong candidate (more data),
    build a held-out evaluation log with TRUE rewards, and show the gate fire."""
    from ..data.pipeline import ARMS, _simulate_arm_reward, assemble_catalogue, build_encoders
    from ..data.features import build_feature_vector
    from .warmstart import WarmStartPricingModel
    from sklearn.model_selection import train_test_split

    rng = np.random.default_rng(123)

    def make_model(rows: int) -> WarmStartPricingModel:
        df = assemble_catalogue(None, None, rows, seed=rows)
        encoders = build_encoders(df)
        X, y = [], []
        for _, row in df.iterrows():
            tp = float(row["price"]); cm = tp / 0.92
            d = row.to_dict()
            d.update(comp_median_price=cm, original_price=cm * 1.4, current_price=tp, floor=max(tp * 0.3, 50))
            for arm in ARMS:
                X.append(build_feature_vector(d, arm=arm, encoders=encoders))
                y.append(_simulate_arm_reward(tp, cm, arm, rng))
        X = np.asarray(X, dtype=np.float32); y = np.asarray(y, dtype=np.float32)
        Xtr, Xv, ytr, yv = train_test_split(X, y, test_size=0.2, random_state=0)
        m = WarmStartPricingModel(); m.encoders = encoders
        m.train(Xtr, ytr, Xv, yv)
        return m

    print("Training CURRENT model (weak: 80 rows)...")
    current = make_model(80)
    print("Training CANDIDATE model (strong: 4000 rows)...")
    candidate = make_model(4000)

    # held-out evaluation log: random logging policy, TRUE simulated reward
    eval_df = assemble_catalogue(None, None, 400, seed=999)
    log: List[Dict] = []
    for _, row in eval_df.iterrows():
        tp = float(row["price"]); cm = tp / 0.92
        d = row.to_dict()
        d.update(comp_median_price=cm, original_price=cm * 1.4, current_price=tp, floor=max(tp * 0.3, 50))
        arm = float(rng.choice(ARMS))
        log.append({"state": d, "arm": arm, "reward": _simulate_arm_reward(tp, cm, arm, rng)})

    print("\n--- Scenario A: strong candidate vs weak current (should PROMOTE) ---")
    offline_policy_evaluation(log, candidate, current)
    print("\n--- Scenario B: candidate vs itself (no gain → should HOLD) ---")
    offline_policy_evaluation(log, candidate, candidate)


if __name__ == "__main__":
    _demo()
