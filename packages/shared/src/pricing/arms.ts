// Dynamic-pricing arms — the discrete price levers the reprice engine pulls.
// Each arm is a MULTIPLIER on the anchor (the nearby comp median). The model
// predicts E[reward] per arm; the bandit picks one; deterministic guardrails clamp
// the result. Keeping the action space small + fixed is what makes every price
// reproducible and explainable ("we chose 0.92× the local median because …").

/** Price multipliers on the comp-median anchor (single source of truth). */
export const PRICE_ARMS = [0.78, 0.85, 0.92, 1.0, 1.1] as const;

/** One discrete price lever: 0.78 | 0.85 | 0.92 | 1 | 1.1. */
export type PriceArm = (typeof PRICE_ARMS)[number];

/** The neutral "at market median" arm, used as the safe default. */
export const NEUTRAL_ARM: PriceArm = 0.92;
