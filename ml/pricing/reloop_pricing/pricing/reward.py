"""Reward function — ReLoop's thesis as math. 1:1 mirror of
packages/shared/src/pricing/reward.ts. The TS runtime and this trainer optimise the
SAME objective; this is the quantity XGBoost learns to predict per price arm.

  sold     →  margin − holding·days + carbon-credit-if-local
  rerouted →  −penalty (warehouse worse than recycle)
  listed   →  0 (intermediate; partial credit only, never terminal)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class RewardConfig:
    holding_cost_per_day: float = 8.0
    handling_cost: float = 120.0
    carbon_credit_local: float = 45.0
    warehouse_penalty: float = 200.0
    recycle_penalty: float = 100.0


DEFAULT_REWARD_CONFIG = RewardConfig()


def compute_reward(outcome: Mapping, config: RewardConfig = DEFAULT_REWARD_CONFIG) -> float:
    """outcome keys: sold, finalPrice, daysOnMarket, soldLocally, rerouted, rerouteDestination."""
    if outcome.get("sold"):
        margin = float(outcome["finalPrice"]) - config.handling_cost
        holding_penalty = config.holding_cost_per_day * float(outcome.get("daysOnMarket", 0))
        carbon_bonus = config.carbon_credit_local if outcome.get("soldLocally") else 0.0
        return margin - holding_penalty + carbon_bonus

    if outcome.get("rerouted"):
        penalty = (
            config.warehouse_penalty
            if outcome.get("rerouteDestination") == "warehouse"
            else config.recycle_penalty
        )
        return -penalty

    return 0.0
