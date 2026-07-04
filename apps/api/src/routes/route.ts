import type { Request, Response } from 'express';
import type {
  CheckpointEvidence,
  ReturnGradingResult,
  ReturnItemState,
  ReturnReason,
  ReturnRoutingDecision,
  ReturnStateTransition,
} from '@reloop/shared';
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
  if (decision === 'liquidate') {
    return `Staged into a manifested hub pallet — graded, Health-Card-listed lots clear at the top of the liquidation band instead of mystery-lot pricing.`;
  }
  return `Value ₹${residualValue} exceeds handling cost ₹${localHandlingCost}. ${nearbyBuyers} buyers within ${radiusKm}km. Routed to ${decision}.`;
}

// Spec 016.1: deterministic template — the "no route" decision needs a replayable
// reason, not an LLM narration.
const RETURNLESS_REASONING =
  'Every route loses money net of pickup and handling — refund issued, the customer keeps the item. Zero legs, zero carbon.';

// Mock customer trust keyed off the observed grade (real: account-history model).
function mockCustomerTrust(grade: ReturnGradingResult['grade']): number {
  if (grade === 'A') return 0.92;
  if (grade === 'B') return 0.75;
  return 0.55;
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
      // Spec 016: doorstep signals → posterior + confidence gates + restock path.
      confidence: gr.confidence,
      packagingSealed: gr.packagingSealed,
      // Spec 016.1: defect-level refurb, fraud gate, returnless trust lever.
      defects: gr.defects,
      wardrobingFlag: gr.wardrobingFlag,
      customerTrust: mockCustomerTrust(gr.grade),
    });

    let reasoning: string;

    if (computed.decision === 'return_to_seller') {
      reasoning = RETURN_TO_SELLER_REASONING;
    } else if (computed.decision === 'returnless_refund') {
      reasoning = RETURNLESS_REASONING;
    } else if (computed.decision === 'liquidate') {
      // Skip the LLM: nearbyBuyers/radiusKm are meaningless for a pallet decision
      // and the generic narration prompt has fabricated "local buyer" language
      // from them before. The deterministic template is the correct story.
      reasoning = buildFallbackReasoning(
        computed.decision,
        computed.residualValue,
        computed.localHandlingCost,
        computed.nearbyBuyers,
        computed.radiusKm,
      );
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
      ttlHours: computed.ttlHours,
      sellerType: computed.sellerType,
      fallbackChain: computed.fallbackChain,
      // Phase 3: the glass-box EV optimization + real freight comparison.
      evBreakdown: computed.evBreakdown,
      localMargin: computed.localMargin,
      warehouseMargin: computed.warehouseMargin,
      warehouseDistanceKm: computed.warehouseDistanceKm,
      nearbyBuyers: computed.nearbyBuyers,
      radiusKm: computed.radiusKm,
      voucherEcoCredits: computed.voucherEcoCredits,
      voucherFactors: computed.voucherFactors,
    };

    res.json(result);
  } catch {
    res.json({ fallback: true, decision: 'warehouse' });
  }
}

// --- Spec 016: checkpoint re-evaluation -------------------------------------
// A return is a lifecycle, not one decision. Each physical checkpoint (driver
// scan, hub bench) submits its evidence here; the SAME deterministic engine
// re-runs with the updated posterior and the item is re-routed while redirect
// is still cheap. The demo web app mirrors this client-side against the shared
// engine; this endpoint is the production-shaped path.

const CHECKPOINT_STATE: Record<CheckpointEvidence['source'], ReturnItemState> = {
  customer: 'evidence_captured',
  driver: 'pickup_verified',
  hub_bench: 'hub_verified',
};

export async function checkpointHandler(req: Request, res: Response): Promise<void> {
  const { gradingResult, reason, sku, sellerType, evidence, from } = req.body as {
    gradingResult: unknown;
    reason: unknown;
    sku: unknown;
    sellerType: unknown;
    evidence: unknown;
    from: unknown;
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
  const ev = evidence as CheckpointEvidence;
  if (ev?.source !== 'customer' && ev?.source !== 'driver' && ev?.source !== 'hub_bench') {
    res.status(400).json({ error: '`evidence.source` must be customer | driver | hub_bench' });
    return;
  }

  try {
    const gr = gradingResult as ReturnGradingResult;
    // Checkpoint evidence overrides the doorstep posterior: a hub-bench grade is
    // near-certain (a human held the item), a driver contradiction voids the seal.
    const grade = ev.observedGrade ?? gr.grade;
    const confidence = ev.confidence ?? (ev.observedGrade !== undefined ? 0.98 : gr.confidence);
    const computed = computeRouting({
      grade,
      reason: reason as ReturnReason,
      sku,
      sellerType,
      authenticityMatch: gr.authenticityMatch,
      functionallyVerifiable: ev.functionalCheckPassed ?? gr.functionallyVerifiable,
      confidence,
      packagingSealed: ev.packagingSealed ?? gr.packagingSealed,
      // Spec 016.1: checkpoints carry the same defect/fraud/trust signals.
      defects: gr.defects,
      wardrobingFlag: gr.wardrobingFlag,
      customerTrust: mockCustomerTrust(grade),
    });

    const overrode = ev.observedGrade !== undefined && ev.observedGrade !== gr.grade;
    const decision: ReturnRoutingDecision = {
      decision: computed.decision,
      reasoning: `${ev.source === 'hub_bench' ? 'Hub bench' : 'Pickup driver'} ${
        overrode ? `overrode grade ${gr.grade ?? '?'} → ${ev.observedGrade}` : `confirmed grade ${grade ?? '?'}`
      }; engine re-ran and routed to ${computed.decision}.`,
      co2SavedKg: computed.co2SavedKg,
      dwellBudgetHours: computed.dwellBudgetHours,
      ttlHours: computed.ttlHours,
      sellerType: computed.sellerType,
      fallbackChain: computed.fallbackChain,
      evBreakdown: computed.evBreakdown,
      localMargin: computed.localMargin,
      warehouseMargin: computed.warehouseMargin,
      warehouseDistanceKm: computed.warehouseDistanceKm,
      nearbyBuyers: computed.nearbyBuyers,
      radiusKm: computed.radiusKm,
      voucherEcoCredits: computed.voucherEcoCredits,
      voucherFactors: computed.voucherFactors,
    };
    const transition: ReturnStateTransition = {
      from: (from as ReturnItemState) ?? 'routed',
      to: CHECKPOINT_STATE[ev.source],
      at: new Date().toISOString(),
      evidence: ev,
      decision,
    };
    res.json({ decision, transition });
  } catch {
    res.status(500).json({ error: 'checkpoint re-evaluation failed' });
  }
}
