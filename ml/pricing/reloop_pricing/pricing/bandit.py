"""Contextual bandit — Thompson Sampling. The SECOND of the two moving parts.

The reward predictor (XGBoost) does the heavy lifting: it says what reward to expect per
arm. The bandit adds calibrated EXPLORATION on top — occasionally tries a non-optimal arm
to gather data in case the model is wrong. It is not RL and not a neural net; it's a
statistician that says "I'm uncertain here, let me try."

Per-arm uncertainty shrinks as observations accumulate:
    sigma(arm) = EXPLORE_FRACTION × reward_spread / sqrt(n_observations(arm))
  - day 1   : wide → explores most arms
  - day 30  : narrow → exploits the model's best arm
  - new bucket : resets to wide

Rewards here are ₹ margins (hundreds–thousands), so the noise is scaled to the spread of
the predicted rewards for THIS decision — a fixed 0.15 (as if rewards were probabilities)
would never explore at this magnitude.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Protocol

import numpy as np

ARMS = [0.78, 0.85, 0.92, 1.00, 1.10]
EXPLORE_FRACTION = 0.6  # initial noise as a fraction of the per-decision reward spread


class RewardPredictor(Protocol):
    def predict_arm_rewards(self, state: Dict) -> Dict[float, float]:
        ...


class ContextualBandit:
    def __init__(self, predictor: RewardPredictor, arms: Optional[List[float]] = None, rng=None):
        self.predictor = predictor
        self.arms = arms or ARMS
        self.arm_observations: Dict[float, int] = {arm: 0 for arm in self.arms}
        self._rng = rng or np.random.default_rng()

    def uncertainty(self, arm: float, spread: float) -> float:
        n = self.arm_observations[arm]
        return EXPLORE_FRACTION * max(spread, 1.0) / np.sqrt(max(n, 1))

    def decide(self, state: Dict, anchor_price: float, floor: float, ceiling: float) -> Dict:
        predicted = self.predictor.predict_arm_rewards(state)
        spread = max(predicted.values()) - min(predicted.values())

        best_score, best_arm = -np.inf, self.arms[2]  # default: neutral 0.92 arm
        scores: Dict[float, float] = {}
        for arm in self.arms:
            candidate_price = anchor_price * arm
            if candidate_price < floor or candidate_price > ceiling:
                scores[arm] = -1e9  # infeasible under hard floor/ceiling
                continue
            noise = float(self._rng.normal(0, self.uncertainty(arm, spread)))
            score = predicted[arm] + noise
            scores[arm] = score
            if score > best_score:
                best_score, best_arm = score, arm

        return {
            "chosen_arm": best_arm,
            "raw_price": anchor_price * best_arm,
            "predicted_rewards": predicted,
            "sampled_scores": scores,
            "anchor_price": anchor_price,
        }

    def update(self, arm: float, reward: float) -> None:
        """Record an observation. Shrinks this arm's exploration; the reward itself
        flows to the logger and improves the model only on the next offline retrain
        (the model is static between retrains — that's the honest 'learning loop')."""
        self.arm_observations[arm] += 1

    def state_dict(self) -> dict:
        return {"arm_observations": dict(self.arm_observations)}

    def load_state_dict(self, state: dict) -> None:
        self.arm_observations = {float(k): int(v) for k, v in state["arm_observations"].items()}
