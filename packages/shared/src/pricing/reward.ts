// The reward function — ReLoop's thesis as math, mirrored 1:1 by reward.py so the
// TypeScript runtime and the Python trainer optimise the SAME objective. This is the
// quantity the XGBoost reward model learns to predict (E[reward | features, arm]).
//
//   sold     →  margin − holding·days + carbon-credit-if-local
//   rerouted →  −penalty (warehouse worse than recycle: the item moved + still no sale)
//   listed   →  0 (intermediate; partial-credit signal during training, not terminal)

import type { PricingOutcome } from './types.js';

/** Reward weights — tune per business decision (kept in sync with reward.py). */
export type RewardConfig = {
  holdingCostPerDay: number; // ₹ cost of capital per day the item sits unsold
  handlingCost: number; // ₹ fixed cost per transaction
  carbonCreditLocal: number; // ₹ equivalent credit for a local sale (no warehouse leg)
  warehousePenalty: number; // ₹ penalty for falling through to warehouse
  recyclePenalty: number; // ₹ penalty for falling through to recycle/donate
};

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  holdingCostPerDay: 8,
  handlingCost: 120,
  carbonCreditLocal: 45,
  warehousePenalty: 200,
  recyclePenalty: 100,
};

export function computeReward(
  outcome: PricingOutcome,
  config: RewardConfig = DEFAULT_REWARD_CONFIG,
): number {
  if (outcome.sold) {
    const margin = outcome.finalPrice - config.handlingCost;
    const holdingPenalty = config.holdingCostPerDay * outcome.daysOnMarket;
    const carbonBonus = outcome.soldLocally ? config.carbonCreditLocal : 0;
    return margin - holdingPenalty + carbonBonus;
  }

  if (outcome.rerouted) {
    // Fell through to donate / recycle / warehouse.
    const penalty =
      outcome.rerouteDestination === 'warehouse'
        ? config.warehousePenalty
        : config.recyclePenalty;
    return -penalty;
  }

  // Still listed — intermediate signal (used for partial credit during training,
  // never as a terminal reward).
  return 0;
}
