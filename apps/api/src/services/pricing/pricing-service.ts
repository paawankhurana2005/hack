// Pricing orchestration (Phase 2). When the item carries a base reference (its
// original Amazon listing, from the provenance chain), a gradient-boosted model
// predicts the RESALE RATIO from named condition/age/demand features and we anchor
// the clearing price to the recorded original retail — the moat. Without a reference
// (long-tail), we fall back to the LLM retail estimate + the deterministic grade-factor
// policy with a wider interval. Either way, a DETERMINISTIC policy owns the final
// number (floor / ceiling / ₹50 rounding); the model only proposes. Logic decides.

import { randomUUID } from 'node:crypto';
import type {
  ConditionGrade,
  DemandLevel,
  Money,
  PriceModelSource,
  PriceRequest,
  PricingFactor,
  PricingResult,
} from '@reloop/shared';
import {
  getPriceModel,
  gradeToOrdinal,
  priceFeaturesFrom,
  sellThroughCurve,
  severityToOrdinal,
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

const DEMAND_ORDINAL: Record<DemandLevel, number> = { low: 0, medium: 1, high: 2 };

export const RETAIL_MIN_CENTS = 10_000; // ₹100
export const RETAIL_MAX_CENTS = 50_000_000; // ₹5,00,000

// Deterministic clamp policy rails (fractions of the reference retail).
const FLOOR_FRACTION = 0.12; // below this, resale isn't viable → belowFloor signal
const CEILING_FRACTION = 0.95; // never list a used item above ~95% of original retail
const ROUND_CENTS = 5_000; // ₹50
const FALLBACK_INTERVAL = 0.2; // ±20% band when there's no base reference

/** Clamp a raw retail estimate into the sane band. */
export function clampRetail(cents: number): number {
  return Math.min(RETAIL_MAX_CENTS, Math.max(RETAIL_MIN_CENTS, cents));
}

/** Round to the nearest ₹50 for clean listing numbers. */
export function roundTo50(cents: number): number {
  return Math.round(cents / ROUND_CENTS) * ROUND_CENTS;
}

/**
 * The deterministic resale-price policy (glass-box): a condition-based fraction of
 * retail, nudged by demand, clamped to 10–90%. Exported as a pure function so the
 * eval harness measures the EXACT policy the service ships (no drift). The model
 * never sets the final price — this does.
 */
export function resalePolicy(
  retailCents: number,
  grade: ConditionGrade,
  demand: DemandLevel,
): { suggestedCents: number; discountPct: number; factor: number } {
  const factor = Math.min(0.9, Math.max(0.1, GRADE_FACTOR[grade] + DEMAND_ADJUST[demand]));
  return {
    suggestedCents: Math.round(retailCents * factor),
    discountPct: 1 - factor,
    factor,
  };
}

function inr(cents: number): Money {
  return { amountCents: cents, currency: 'INR' };
}

function fmt(cents: number): string {
  return `₹${(cents / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function ageYearsFrom(purchaseDate?: string): number {
  if (!purchaseDate) return 1;
  const t = Date.parse(purchaseDate);
  if (Number.isNaN(t)) return 1;
  return Math.max(0, (Date.now() - t) / (365 * 86_400_000));
}

/** Local demand from verified nearby buyers, if provided. */
function demandFromBuyers(nearbyBuyers?: number): DemandLevel | null {
  if (nearbyBuyers === undefined) return null;
  if (nearbyBuyers >= 6) return 'high';
  if (nearbyBuyers >= 3) return 'medium';
  return 'low';
}

export class PricingService {
  constructor(private readonly market: MarketProvider) {}

  async price(req: PriceRequest): Promise<PricingResult> {
    const estimate = await this.market.estimate({
      draft: req.draft,
      detectedIssues: req.detectedIssues,
    });

    // Base reference anchors retail to the recorded first-sale price (the moat);
    // otherwise the LLM estimate is the retail anchor (long-tail fallback).
    const retailCents = req.reference
      ? clampRetail(req.reference.originalRetailCents)
      : clampRetail(estimate.estimatedRetailCents);
    const demand = demandFromBuyers(req.nearbyBuyers) ?? estimate.demand;

    const floorCents = Math.round(retailCents * FLOOR_FRACTION);
    const ceilingCents = Math.round(retailCents * CEILING_FRACTION);

    // --- 1. Propose a clearing price (model when anchored; policy otherwise) ----
    let clearingCents: number;
    let lowCents: number;
    let highCents: number;
    let modelSource: PriceModelSource;
    let ratioPctLabel: string;

    if (req.reference) {
      const structured = req.structuredIssues ?? [];
      const maxSeverity = structured.length
        ? Math.max(...structured.map((i) => severityToOrdinal(i.severity)))
        : 0;
      const features = priceFeaturesFrom({
        gradeOrdinal: gradeToOrdinal(req.grade),
        demandOrdinal: DEMAND_ORDINAL[demand],
        maxSeverity,
        severeCount: structured.filter((i) => i.severity === 'severe').length,
        completeness: req.completeness ?? 0.9,
        ageYears: ageYearsFrom(req.reference.purchaseDate),
        authenticityConfidence: req.authenticityConfidence ?? 0.95,
      });
      const pred = getPriceModel().predictRatio(features);
      clearingCents = Math.round(pred.ratio * retailCents);
      lowCents = Math.round(pred.ratioLow * retailCents);
      highCents = Math.round(pred.ratioHigh * retailCents);
      modelSource = 'gbdt';
      ratioPctLabel = `${Math.round(pred.ratio * 100)}% of original retail (model)`;
    } else {
      const { suggestedCents } = resalePolicy(retailCents, req.grade, demand);
      clearingCents = suggestedCents;
      lowCents = Math.round(suggestedCents * (1 - FALLBACK_INTERVAL));
      highCents = Math.round(suggestedCents * (1 + FALLBACK_INTERVAL));
      modelSource = 'fallback-policy';
      ratioPctLabel = `${Math.round((suggestedCents / retailCents) * 100)}% of retail (policy)`;
    }

    // --- 2. Deterministic policy OWNS the final number -------------------------
    const belowFloor = clearingCents < floorCents;
    const suggestedCents = roundTo50(Math.min(ceilingCents, Math.max(floorCents, clearingCents)));
    const discountPct = 1 - suggestedCents / retailCents;
    const priceLow = inr(roundTo50(Math.min(suggestedCents, Math.max(floorCents, lowCents))));
    const priceHigh = inr(roundTo50(Math.min(ceilingCents, Math.max(suggestedCents, highCents))));

    // --- 3. Sell-through curve (price ↔ time-to-sell) -------------------------
    const curve = sellThroughCurve(suggestedCents, demand, roundTo50);

    const factors: PricingFactor[] = [
      { label: req.reference ? 'Original retail (reference)' : 'Estimated retail', value: fmt(retailCents) },
      { label: 'Condition', value: req.grade },
      { label: 'Local demand', value: demand },
      { label: 'Resale ratio', value: ratioPctLabel },
      { label: 'Predicted band', value: `${fmt(priceLow.amountCents)}–${fmt(priceHigh.amountCents)}` },
    ];

    const recommended = curve.find((p) => p.label === 'recommended');
    const demandPhrase =
      demand === 'high' ? ' and strong local demand' : demand === 'low' ? ' and softer demand' : '';
    const anchorPhrase = req.reference
      ? `Anchored to its ${fmt(retailCents)} original Amazon price, `
      : `${estimate.note ? `${estimate.note} ` : ''}`;
    const rationale =
      `${anchorPhrase}given ${req.grade} condition${demandPhrase}, we suggest ` +
      `${fmt(suggestedCents)} — about ${Math.round(discountPct * 100)}% off` +
      (recommended ? `, expected to sell in ~${recommended.expectedDays} days.` : '.') +
      (belowFloor ? ' Resale value is below the salvage floor — routing may beat reselling.' : '');

    return {
      id: `price_${randomUUID()}`,
      productId: `prod_${randomUUID()}`,
      grade: req.grade,
      estimatedRetail: inr(retailCents),
      suggestedPrice: inr(suggestedCents),
      discountPct,
      demand,
      rationale,
      factors,
      priceLow,
      priceHigh,
      sellThroughCurve: curve,
      belowFloor,
      modelSource,
      pricedAt: new Date().toISOString(),
    };
  }
}
