// Pricing orchestration. The LLM provides market price + demand; THIS layer
// deterministically decides the resale price (glass-box): a condition-based
// fraction of retail, nudged by demand. Logic decides, the model narrates.

import { randomUUID } from 'node:crypto';
import type {
  ConditionGrade,
  DemandLevel,
  Money,
  PriceRequest,
  PricingFactor,
  PricingResult,
} from '@reloop/shared';
import type { MarketProvider } from './types.js';

// Resale price as a fraction of estimated retail, by condition.
const GRADE_FACTOR: Record<ConditionGrade, number> = {
  new: 0.8,
  'like-new': 0.7,
  good: 0.55,
  fair: 0.4,
  poor: 0.22,
};

// Demand nudges the fraction up or down.
const DEMAND_ADJUST: Record<DemandLevel, number> = {
  high: 0.05,
  medium: 0,
  low: -0.05,
};

const RETAIL_MIN_CENTS = 10_000; // ₹100
const RETAIL_MAX_CENTS = 50_000_000; // ₹5,00,000

function inr(cents: number): Money {
  return { amountCents: cents, currency: 'INR' };
}

function fmt(cents: number): string {
  return `₹${(cents / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export class PricingService {
  constructor(private readonly market: MarketProvider) {}

  async price(req: PriceRequest): Promise<PricingResult> {
    const estimate = await this.market.estimate({
      draft: req.draft,
      detectedIssues: req.detectedIssues,
    });

    const retailCents = Math.min(
      RETAIL_MAX_CENTS,
      Math.max(RETAIL_MIN_CENTS, estimate.estimatedRetailCents),
    );

    const factor = Math.min(
      0.9,
      Math.max(0.1, GRADE_FACTOR[req.grade] + DEMAND_ADJUST[estimate.demand]),
    );
    const suggestedCents = Math.round(retailCents * factor);
    const discountPct = 1 - factor;

    const factors: PricingFactor[] = [
      { label: 'Estimated retail', value: fmt(retailCents) },
      { label: 'Condition', value: req.grade },
      { label: 'Local demand', value: estimate.demand },
      { label: 'Resale factor', value: `${Math.round(factor * 100)}% of retail` },
    ];

    const demandPhrase =
      estimate.demand === 'high'
        ? ' and strong local demand'
        : estimate.demand === 'low'
          ? ' and softer demand'
          : '';
    const rationale =
      (estimate.note ? `${estimate.note} ` : '') +
      `Given ${req.grade} condition${demandPhrase}, we suggest listing at ` +
      `${fmt(suggestedCents)} — about ${Math.round(discountPct * 100)}% off the ` +
      `~${fmt(retailCents)} estimated retail.`;

    return {
      id: `price_${randomUUID()}`,
      productId: `prod_${randomUUID()}`,
      grade: req.grade,
      estimatedRetail: inr(retailCents),
      suggestedPrice: inr(suggestedCents),
      discountPct,
      demand: estimate.demand,
      rationale,
      factors,
      pricedAt: new Date().toISOString(),
    };
  }
}
