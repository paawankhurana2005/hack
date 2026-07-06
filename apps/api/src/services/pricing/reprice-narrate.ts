// Narration — the "NARRATE" half. The deterministic template below ALWAYS produces a
// correct, reproducible sentence from the decision's own numbers; an LLM may rephrase it
// more naturally, but if the LLM is unavailable or wrong the template stands. The model
// perceived, the rules decided, the words only describe — they never change the price.

import type { PricingDecision, PricingReasonCode } from '@reloop/shared';

export function fallbackNarration(decision: PricingDecision): string {
  const prior = decision.anchorPrice * decision.chosenArm;
  const delta = decision.finalPrice - prior;
  const direction = delta >= 0 ? 'up' : 'down';
  const amount = Math.abs(Math.round(delta));

  const reasonMap: Record<PricingReasonCode, string> = {
    comp_sold_nearby: `nudged ${direction} ₹${amount} — a similar item just sold nearby`,
    comp_listed_cheaper: `nudged ${direction} ₹${amount} — a cheaper competitor listed nearby`,
    amazon_new_price_dropped: `nudged ${direction} ₹${amount} — Amazon's new price moved`,
    view_velocity_drop: `nudged ${direction} ₹${amount} — views have been slowing`,
    dwell_threshold: `nudged ${direction} ₹${amount} — a listing-age milestone was reached`,
    save_no_purchase: `nudged ${direction} ₹${amount} — saved but not bought in 72h`,
    deadline_pressure: `nudged ${direction} ₹${amount} — the seller deadline is approaching`,
    initial_listing: `set from the ₹${Math.round(decision.anchorPrice)} local median and current demand`,
    heartbeat_staleness: `nudged ${direction} ₹${amount} — no activity in the last day`,
    seller_markdown: `set to ₹${decision.finalPrice} on the seller's approved markdown`,
  };

  const verb =
    decision.reasonCode === 'initial_listing' || decision.reasonCode === 'seller_markdown'
      ? 'Listed'
      : 'Repriced';
  return `${verb} at ₹${decision.finalPrice}: ${reasonMap[decision.reasonCode]}.`;
}

export interface Completer {
  complete: (prompt: string) => Promise<string>;
}

/** Try the LLM; fall back to the deterministic template. Never throws. */
export async function narrateDecision(decision: PricingDecision, llm?: Completer): Promise<string> {
  if (!llm) return fallbackNarration(decision);
  try {
    const triggered = decision.guardrailsApplied.filter((g) => g.triggered).map((g) => g.rule);
    const prompt = [
      'Write exactly one sentence explaining this resale pricing decision.',
      'Be specific, use the numbers, do not invent facts.',
      `Old price: ₹${Math.round(decision.anchorPrice * decision.chosenArm)}`,
      `New price: ₹${decision.finalPrice}`,
      `Reason: ${decision.reasonCode}`,
      `Guardrails applied: ${triggered.join(', ') || 'none'}`,
      'One sentence only:',
    ].join('\n');
    const out = (await llm.complete(prompt)).trim().split('\n')[0];
    return out && out.length > 0 ? out : fallbackNarration(decision);
  } catch {
    return fallbackNarration(decision);
  }
}
