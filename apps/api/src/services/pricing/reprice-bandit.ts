// Thompson-sampling contextual bandit (TS mirror of ml/pricing/.../bandit.py) — the
// "EXPLORE" half. Looks at the reward model's per-arm predictions and adds calibrated
// noise so we occasionally try a non-optimal arm and gather data. Not RL, not a net.
// Posteriors are POOLED per (category × grade) bucket: every outcome teaches the whole
// bucket and warm-starts the next listing. In production this state lives in DynamoDB;
// here it's in-memory for the demo.

import type { BanditState, ContextBucket, PriceArm } from '@reloop/shared';
import { PRICE_ARMS, NEUTRAL_ARM } from '@reloop/shared';

const EXPLORE_FRACTION = 0.6; // initial noise as a fraction of the per-decision spread

function bucketKey(b: ContextBucket): string {
  return `${b.category}|${b.gradeKey}`;
}

function zeroObs(): Record<PriceArm, number> {
  const obs = {} as Record<PriceArm, number>;
  for (const arm of PRICE_ARMS) obs[arm] = 0;
  return obs;
}

export interface BanditChoice {
  chosenArm: PriceArm;
  sampledScores: Record<PriceArm, number>;
}

export class RepriceBandit {
  // bucketKey → per-arm observation counts (shrinks exploration over time).
  private readonly observations = new Map<string, Record<PriceArm, number>>();

  private obsFor(bucket: ContextBucket): Record<PriceArm, number> {
    const key = bucketKey(bucket);
    let obs = this.observations.get(key);
    if (!obs) {
      obs = zeroObs();
      this.observations.set(key, obs);
    }
    return obs;
  }

  private uncertainty(n: number, spread: number): number {
    return (EXPLORE_FRACTION * Math.max(spread, 1)) / Math.sqrt(Math.max(n, 1));
  }

  /** Pick an arm: model prediction + Thompson noise, clamped to feasible prices. */
  decide(
    bucket: ContextBucket,
    predicted: Record<PriceArm, number>,
    anchor: number,
    floor: number,
    ceiling: number,
  ): BanditChoice {
    const obs = this.obsFor(bucket);
    const values = PRICE_ARMS.map((a) => predicted[a]);
    const spread = Math.max(...values) - Math.min(...values);

    let bestScore = -Infinity;
    let chosenArm: PriceArm = NEUTRAL_ARM;
    const sampledScores = {} as Record<PriceArm, number>;
    for (const arm of PRICE_ARMS) {
      const price = anchor * arm;
      if (price < floor || price > ceiling) {
        sampledScores[arm] = -1e9; // infeasible under the hard floor/ceiling
        continue;
      }
      const noise = gaussian() * this.uncertainty(obs[arm], spread);
      const score = predicted[arm] + noise;
      sampledScores[arm] = score;
      if (score > bestScore) {
        bestScore = score;
        chosenArm = arm;
      }
    }
    return { chosenArm, sampledScores };
  }

  /** Record an outcome — shrinks this arm's exploration in this bucket. */
  update(bucket: ContextBucket, arm: PriceArm): void {
    this.obsFor(bucket)[arm] += 1;
  }

  snapshot(bucket: ContextBucket): BanditState {
    const obs = this.obsFor(bucket);
    const armUncertainty = {} as Record<PriceArm, number>;
    let total = 0;
    for (const arm of PRICE_ARMS) {
      total += obs[arm];
      armUncertainty[arm] = this.uncertainty(obs[arm], 1);
    }
    return {
      bucket,
      armObservations: { ...obs },
      armUncertainty,
      totalDecisions: total,
      lastUpdated: new Date().toISOString(),
    };
  }
}

// Box–Muller standard normal (no dependency).
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
