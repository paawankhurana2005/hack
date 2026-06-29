// Reward model client for the dynamic reprice engine — the "PERCEIVE" half.
// Predicts E[reward | state, arm] for each price arm. In production this is the trained
// XGBoost served over HTTP (ml/pricing); for local/dev the deterministic heuristic below
// mirrors the same logistic demand curve the model was warm-started on, so the API runs
// with no Python dependency. Set PRICING_MODEL_URL to switch to the real model.

import type { PriceArm, PricingStateVector, SellThroughCurvePoint } from '@reloop/shared';
import { PRICE_ARMS, DEFAULT_REWARD_CONFIG } from '@reloop/shared';

export interface RewardPrediction {
  /** Expected reward (₹) per arm. */
  rewards: Record<PriceArm, number>;
  /** Per-arm price ↔ time-to-sell, reused for the UI sell-through curve. */
  curve: SellThroughCurvePoint[];
}

export interface RewardModel {
  predict(state: PricingStateVector, anchor: number): Promise<RewardPrediction>;
}

const BASE_DAYS = 8; // days-to-sell at the clearing price
const { handlingCost, holdingCostPerDay } = DEFAULT_REWARD_CONFIG;

/** Logistic sell-probability: falls as the candidate price rises above clearing. */
function sellProbability(candidate: number, clearing: number): number {
  return 1 / (1 + Math.exp(8 * (candidate / clearing - 1)));
}

/** Deterministic reward model — the dev/offline stand-in for the XGBoost server. */
export class HeuristicRewardModel implements RewardModel {
  async predict(_state: PricingStateVector, anchor: number): Promise<RewardPrediction> {
    // The catalogue median sits ~8% above the true clearing price (the warm-start
    // assumption true_price ≈ comp_median × 0.92).
    const clearing = anchor * 0.92;
    const rewards = {} as Record<PriceArm, number>;
    const curve: SellThroughCurvePoint[] = [];
    for (const arm of PRICE_ARMS) {
      const price = anchor * arm;
      const p = sellProbability(price, clearing);
      const expectedDaysToSell = Math.max(1, Math.min(60, Math.round(BASE_DAYS / Math.max(p, 0.05))));
      const margin = price - handlingCost;
      rewards[arm] = p * (margin - holdingCostPerDay * expectedDaysToSell);
      curve.push({ price, expectedDaysToSell, probability: Math.round(p * 100) / 100 });
    }
    return { rewards, curve };
  }
}

/** Real model: POST the state to the XGBoost server, fall back to heuristic on error. */
export class HttpRewardModel implements RewardModel {
  private readonly fallback = new HeuristicRewardModel();
  constructor(private readonly baseUrl: string) {}

  async predict(state: PricingStateVector, anchor: number): Promise<RewardPrediction> {
    try {
      const res = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state, arms: PRICE_ARMS }),
      });
      if (!res.ok) throw new Error(`pricing model responded ${res.status}`);
      const j = (await res.json()) as { rewards: Record<string, number> };
      const rewards = {} as Record<PriceArm, number>;
      for (const arm of PRICE_ARMS) rewards[arm] = j.rewards[String(arm)] ?? 0;
      // Reuse the heuristic curve for time-to-sell (server returns rewards only).
      const { curve } = await this.fallback.predict(state, anchor);
      return { rewards, curve };
    } catch {
      return this.fallback.predict(state, anchor);
    }
  }
}
