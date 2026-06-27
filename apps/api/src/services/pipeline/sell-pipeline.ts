// The Sell flow (grade → price → health-card) composed on the generic staged
// pipeline. This is the working demonstration of the rail: each model-backed stage
// gets a timeout, retries, and a deterministic fallback, so the pipeline ALWAYS
// returns a usable {grading, pricing, card} plus a trace — no screen can fail
// because an inference call did. Additive: the existing /grade, /price,
// /health-card endpoints and the client flow are unchanged.

import { randomUUID } from 'node:crypto';
import {
  runPipeline3,
  stableKey,
  type GradeRequest,
  type GradingResult,
  type PriceReference,
  type PricingResult,
  type ProductHealthCard,
  type SellItemDraft,
  type Stage,
  type StageTrace,
} from '@reloop/shared';
import type { GradingService } from '../grading/grading-service.js';
import type { PricingService } from '../pricing/pricing-service.js';
import type { HealthCardService } from '../health-card/health-card-service.js';
import { clampRetail, resalePolicy } from '../pricing/pricing-service.js';
import { CATEGORY_DEFAULT_INR } from '../pricing/nvidia-market-provider.js';

export interface SellPipelineDeps {
  grading: GradingService;
  pricing: PricingService;
  healthCard: HealthCardService;
}

export interface SellPipelineInput extends GradeRequest {
  requestKey: string; // always set (derived if the caller omits it)
  /** Base reference for anchored pricing (the original Amazon listing). */
  priceReference?: PriceReference;
  completeness?: number;
  nearbyBuyers?: number;
}

/** What the route hands in — the pipeline derives requestKey if absent. */
export type SellPipelineRequest = GradeRequest & {
  priceReference?: PriceReference;
  completeness?: number;
  nearbyBuyers?: number;
};

export interface SellPipelineOutput {
  grading: GradingResult;
  pricing: PricingResult;
  card: ProductHealthCard;
  trace: StageTrace[];
  usedFallback: boolean;
}

// Per-stage timeouts: a base64 image VLM call is slow; pricing is a text call.
const GRADE_TIMEOUT_MS = 60_000;
const PRICE_TIMEOUT_MS = 45_000;
const CARD_TIMEOUT_MS = 5_000;

// --- Deterministic fallbacks (never call a model) ----------------------------

/** Conservative grade when perception is unavailable: low confidence + a clear
 *  review flag. We do NOT invent a flattering grade — Fair is the safe assumption,
 *  and the flag routes it to manual review (Phase 6 HITL). */
function fallbackGrading(req: GradeRequest): GradingResult {
  return {
    id: `grade_${randomUUID()}`,
    productId: `prod_${randomUUID()}`,
    grade: 'fair',
    confidence: 0.3,
    detectedIssues: ['Automated grading unavailable — manual review recommended'],
    summary: 'Could not grade automatically; flagged for manual review.',
    photoUrls: req.imagesBase64.map((b64) => `data:image/jpeg;base64,${b64}`),
    gradedAt: new Date().toISOString(),
  };
}

/** Deterministic price when the market estimate is unavailable: category anchor +
 *  the same glass-box resale policy the service ships. */
function fallbackPricing(draft: SellItemDraft, grading: GradingResult): PricingResult {
  const retailCents = clampRetail(CATEGORY_DEFAULT_INR[draft.category] * 100);
  const { suggestedCents, discountPct, factor } = resalePolicy(retailCents, grading.grade, 'medium');
  return {
    id: `price_${randomUUID()}`,
    productId: grading.productId,
    grade: grading.grade,
    estimatedRetail: { amountCents: retailCents, currency: 'INR' },
    suggestedPrice: { amountCents: suggestedCents, currency: 'INR' },
    discountPct,
    demand: 'medium',
    rationale: `Estimated from the ${draft.category} category at ${Math.round(
      factor * 100,
    )}% of typical retail (market lookup unavailable).`,
    factors: [
      { label: 'Estimated retail', value: `₹${Math.round(retailCents / 100).toLocaleString('en-IN')}` },
      { label: 'Condition', value: grading.grade },
      { label: 'Local demand', value: 'medium' },
      { label: 'Resale factor', value: `${Math.round(factor * 100)}% of retail` },
    ],
    pricedAt: new Date().toISOString(),
  };
}

// --- Stages ------------------------------------------------------------------

type GradeOut = { input: SellPipelineInput; grading: GradingResult };
type PriceOut = GradeOut & { pricing: PricingResult };
type CardOut = { grading: GradingResult; pricing: PricingResult; card: ProductHealthCard };

export async function runSellPipeline(
  deps: SellPipelineDeps,
  raw: SellPipelineRequest,
): Promise<SellPipelineOutput> {
  const requestKey =
    raw.requestKey ?? stableKey('sell', raw.draft, raw.imagesBase64.length, raw.imagesBase64[0]?.slice(0, 64));
  const input: SellPipelineInput = { ...raw, requestKey };

  const gradeStage: Stage<SellPipelineInput, GradeOut> = {
    name: 'grade',
    timeoutMs: GRADE_TIMEOUT_MS,
    retries: 0, // GradingService already loops/retries per image internally
    run: async (i) => ({ input: i, grading: await deps.grading.grade(i) }),
    fallback: (i) => ({ input: i, grading: fallbackGrading(i) }),
  };

  const priceStage: Stage<GradeOut, PriceOut> = {
    name: 'price',
    timeoutMs: PRICE_TIMEOUT_MS,
    retries: 0, // the market provider retries+falls back internally
    run: async (g) => ({
      ...g,
      pricing: await deps.pricing.price({
        draft: g.input.draft,
        grade: g.grading.grade,
        detectedIssues: g.grading.detectedIssues,
        requestKey: g.input.requestKey,
        // Phase 2 feature inputs: base reference + condition signals from grading.
        reference: g.input.priceReference,
        structuredIssues: g.grading.structuredIssues,
        completeness: g.input.completeness,
        authenticityConfidence: g.grading.referenceComparison?.authenticityConfidence,
        nearbyBuyers: g.input.nearbyBuyers,
      }),
    }),
    fallback: (g) => ({ ...g, pricing: fallbackPricing(g.input.draft, g.grading) }),
  };

  const cardStage: Stage<PriceOut, CardOut> = {
    name: 'card',
    timeoutMs: CARD_TIMEOUT_MS,
    retries: 0,
    // Pure assembly — deterministic; the "run" and "fallback" are identical.
    run: async (p) => ({
      grading: p.grading,
      pricing: p.pricing,
      card: deps.healthCard.build({ draft: p.input.draft, grading: p.grading, pricing: p.pricing }),
    }),
    fallback: (p) => ({
      grading: p.grading,
      pricing: p.pricing,
      card: deps.healthCard.build({ draft: p.input.draft, grading: p.grading, pricing: p.pricing }),
    }),
  };

  const result = await runPipeline3(input, gradeStage, priceStage, cardStage);
  return {
    grading: result.output.grading,
    pricing: result.output.pricing,
    card: result.output.card,
    trace: result.trace,
    usedFallback: result.usedFallback,
  };
}
