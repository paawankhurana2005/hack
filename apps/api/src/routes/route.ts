import type { Request, Response } from 'express';
import type { ReturnGradingResult, ReturnReason, ReturnRoutingDecision } from '@reloop/shared';
import { nvidiaChat } from '../lib/nvidia-client.js';
import { MOCK_MODE } from '../lib/env.js';
import { computeRouting } from '../lib/routing-engine.js';

const TEXT_MODEL = 'meta/llama-3.1-70b-instruct';

const NARRATION_SYSTEM =
  'You are a logistics assistant. Write exactly one plain English sentence explaining this routing decision. No jargon. Be specific about the numbers. Maximum 30 words.';

function buildFallbackReasoning(
  decision: ReturnRoutingDecision['decision'],
  residualValue: number,
  localHandlingCost: number,
  nearbyBuyers: number,
  radiusKm: number,
): string {
  return `Value ₹${residualValue} exceeds handling cost ₹${localHandlingCost}. ${nearbyBuyers} buyers within ${radiusKm}km. Routed to ${decision}.`;
}

async function narrateRouting(
  computed: {
    decision: ReturnRoutingDecision['decision'];
    residualValue: number;
    localHandlingCost: number;
    nearbyBuyers: number;
    radiusKm: number;
    co2SavedKg: number;
  },
): Promise<string> {
  const userMsg = JSON.stringify({
    decision: computed.decision,
    residualValue: computed.residualValue,
    localHandlingCost: computed.localHandlingCost,
    nearbyBuyers: computed.nearbyBuyers,
    radiusKm: computed.radiusKm,
    co2SavedKg: computed.co2SavedKg,
  });

  return nvidiaChat({
    model: TEXT_MODEL,
    messages: [
      { role: 'system', content: NARRATION_SYSTEM },
      { role: 'user', content: userMsg },
    ],
    maxTokens: 64,
    temperature: 0.3,
  });
}

const RETURN_TO_SELLER_REASONING =
  '3P seller not opted into ReLoop local routing. Item returned per seller policy.';

const VALID_REASONS = new Set<string>([
  'didnt_fit', 'changed_mind', 'duplicate_gift', 'defective',
  'stopped_working', 'arrived_damaged', 'wrong_item', 'counterfeit', 'not_as_described',
]);

export async function routeHandler(req: Request, res: Response): Promise<void> {
  const { gradingResult, reason, sku, sellerType } = req.body as {
    gradingResult: unknown;
    reason: unknown;
    sku: unknown;
    sellerType: unknown;
  };

  if (typeof reason !== 'string' || !VALID_REASONS.has(reason)) {
    res.status(400).json({ error: '`reason` must be a valid ReturnReason' });
    return;
  }
  if (typeof sku !== 'string') {
    res.status(400).json({ error: '`sku` must be a string' });
    return;
  }
  if (sellerType !== '1P' && sellerType !== '3P') {
    res.status(400).json({ error: '`sellerType` must be "1P" or "3P"' });
    return;
  }

  const typedReason = reason as ReturnReason;

  try {
    const gr = gradingResult as ReturnGradingResult;

    // computeRouting is pure TypeScript — always runs regardless of MOCK_MODE
    const computed = computeRouting({
      grade: gr.grade,
      reason: typedReason,
      sku,
      sellerType,
      authenticityMatch: gr.authenticityMatch,
      functionallyVerifiable: gr.functionallyVerifiable,
    });

    let reasoning: string;

    if (computed.decision === 'return_to_seller') {
      reasoning = RETURN_TO_SELLER_REASONING;
    } else if (MOCK_MODE) {
      // In mock mode, skip NVIDIA and use the template string directly
      reasoning = buildFallbackReasoning(
        computed.decision,
        computed.residualValue,
        computed.localHandlingCost,
        computed.nearbyBuyers,
        computed.radiusKm,
      );
    } else {
      try {
        reasoning = await narrateRouting(computed);
      } catch {
        reasoning = buildFallbackReasoning(
          computed.decision,
          computed.residualValue,
          computed.localHandlingCost,
          computed.nearbyBuyers,
          computed.radiusKm,
        );
      }
    }

    const result: ReturnRoutingDecision = {
      decision: computed.decision,
      reasoning,
      co2SavedKg: computed.co2SavedKg,
      dwellBudgetHours: computed.dwellBudgetHours,
      sellerType: computed.sellerType,
      fallbackChain: computed.fallbackChain,
    };

    res.json(result);
  } catch {
    res.json({ fallback: true, decision: 'warehouse' });
  }
}
