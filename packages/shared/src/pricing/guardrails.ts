// Deterministic guardrails — these wrap EVERY model output. No model bypasses them,
// which is what keeps the on-screen price reproducible and auditable: "why ₹1,050?" →
// point at the exact rule + feature values. The model proposes; these rules decide.
//
//   hard floor  = max(sellerFloor, routeElsewhereValue)  → below it, REROUTE (hand
//                 off to the Intelligent Bridge) instead of pricing lower
//   ceiling     = amazonNewPrice × 0.95                   → never within 5% of new
//   max step    = min(₹100, 8% of current price)          → no whiplash per reprice
//   rounding    = nearest ₹50                             → human-legible prices

import type { PricingStateVector, GuardrailResult } from './types.js';

export type GuardrailInput = {
  proposedPrice: number;
  currentPrice: number;
  state: PricingStateVector;
  isFirstListing: boolean;
};

export type GuardrailOutput = {
  finalPrice: number;
  /** true when the price hit the floor — signal the Bridge to reroute. */
  shouldReroute: boolean;
  guardrailsApplied: GuardrailResult[];
};

export function applyGuardrails(input: GuardrailInput): GuardrailOutput {
  const { proposedPrice, currentPrice, state, isFirstListing } = input;
  const applied: GuardrailResult[] = [];

  // 1. true floor and ceiling
  const floor = Math.max(state.sellerFloor, state.routeElsewhereValue);
  const ceiling = state.amazonNewPrice * 0.95; // never within 5% of new price

  let price = proposedPrice;

  // 2. hard floor — below this, reroute instead of pricing lower
  if (price < floor) {
    applied.push({ rule: 'hard_floor', triggered: true, adjustment: floor - price });
    return { finalPrice: floor, shouldReroute: true, guardrailsApplied: applied };
  }

  // 3. hard ceiling
  if (price > ceiling) {
    applied.push({ rule: 'ceiling', triggered: true, adjustment: ceiling - price });
    price = ceiling;
  }

  // 4. max change per step (skip on first listing — no prior price)
  if (!isFirstListing) {
    const maxStepChange = Math.min(100, currentPrice * 0.08); // ₹100 or 8%
    const delta = price - currentPrice;
    if (Math.abs(delta) > maxStepChange) {
      const clampedDelta = Math.sign(delta) * maxStepChange;
      applied.push({
        rule: 'max_step_change',
        triggered: true,
        adjustment: clampedDelta - delta,
      });
      price = currentPrice + clampedDelta;
    }
  }

  // 5. round to nearest ₹50
  const rounded = Math.round(price / 50) * 50;
  if (rounded !== price) {
    applied.push({ rule: 'round_to_50', triggered: true, adjustment: rounded - price });
    price = rounded;
  }

  // 6. final floor check after rounding
  if (price < floor) {
    price = floor;
    applied.push({ rule: 'post_round_floor', triggered: true });
  }

  return { finalPrice: price, shouldReroute: false, guardrailsApplied: applied };
}
