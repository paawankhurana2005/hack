// Return-flow routing (Phase 3). Thin adapter over the shared EV engine: it builds a
// RoutingEvProfile from the return signals + a SKU-keyed economic profile (mock now;
// Location Service / the P2 model in prod), then `decideRoute` applies the hard
// constraint ladder and EV optimization. Same hard-rule decisions as before; the old
// soft rules are now an explainable value-vs-carbon optimization. computeRouting keeps
// its signature so route.ts + the eval harness are unchanged callers.

import type {
  ItemCategory,
  ReturnGradingResult,
  ReturnReason,
  ReturnRoutingDecision,
  RoutingEvBreakdown,
  RoutingFactor,
} from '@reloop/shared';
import {
  computeReturnVoucherCredits,
  decideRoute,
  posteriorFromPointGrade,
  tagDefects,
  type RoutingEvProfile,
} from '@reloop/shared';

export interface RoutingInputs {
  grade: ReturnGradingResult['grade'];
  reason: ReturnReason;
  sku: string;
  sellerType: '1P' | '3P';
  authenticityMatch: boolean;
  functionallyVerifiable: boolean;
  /** Optional fraud signal: claimed reason contradicts the observed grade. */
  reasonGradeMismatch?: boolean;
  // Spec 016 (all optional — eval-harness and legacy callers are unchanged):
  /** Calibrated grading confidence 0–1; drives the posterior + route gates θ_r. */
  confidence?: number;
  /** Factory seal verified from photos/driver scan — gates the restock path. */
  packagingSealed?: boolean;
  // Spec 016.1 (all optional):
  /** Free-text grader defects — mapped to DefectTags for defect-level refurb economics. */
  defects?: string[];
  /** 0–1 customer trust; gates the returnless-refund path (omit = ineligible). */
  customerTrust?: number;
  /** Wardrobing/photo-reuse flag — hard-blocks returnless refund. */
  wardrobingFlag?: boolean;
}

export interface RoutingComputed {
  decision: ReturnRoutingDecision['decision'];
  residualValue: number; // rupees (legacy display)
  localHandlingCost: number; // rupees
  nearbyBuyers: number;
  radiusKm: number;
  co2SavedKg: number;
  dwellBudgetHours: number;
  ttlHours: number; // spec 016: decision validity before checkpoint re-evaluation
  sellerType: '1P' | '3P';
  fallbackChain: ReturnRoutingDecision['decision'][];
  // Phase 3 additions:
  evBreakdown: RoutingEvBreakdown;
  localMargin: number; // rupees
  warehouseMargin: number; // rupees
  warehouseDistanceKm: number;
  // Spec 015: only set for 1P items diverted from the warehouse (Track A scope).
  voucherEcoCredits?: number;
  voucherFactors?: RoutingFactor[];
}

interface MockPricing {
  residualValue: number; // rupees
  localHandlingCost: number; // rupees
  nearbyBuyers: number;
  radiusKm: number;
}

// SKU-prefix economic profile (mock; the P2 model + catalog supply these in prod).
function getPricing(sku: string): MockPricing {
  const prefix = sku.slice(0, 3);
  if (prefix === 'B09') return { residualValue: 2499, localHandlingCost: 380, nearbyBuyers: 8, radiusKm: 4 };
  if (prefix === 'B08') return { residualValue: 799, localHandlingCost: 220, nearbyBuyers: 5, radiusKm: 3 };
  if (prefix === 'B07') return { residualValue: 599, localHandlingCost: 180, nearbyBuyers: 4, radiusKm: 3 };
  return { residualValue: 500, localHandlingCost: 300, nearbyBuyers: 2, radiusKm: 5 };
}

// Distance to the regional returns hub (km). Constant now; Location Service in prod.
const WAREHOUSE_DISTANCE_KM = 580;
// Spec 016: the NEAREST fulfilment centre — the restock inbound leg. The 580km
// returns hub vs the 45km city FC is exactly the leg the restock path deletes.
const NEAREST_FC_KM = 45;

// Same SKU-prefix mock the pricing table already keys off — an ItemCategory is
// needed for carbon accounting (spec 015) but the return flow has no catalog
// lookup yet. Mirrors the real category split in the return-flow mock fixtures
// (B09 → electronics, B08 → apparel/fashion, B07 → kitchenware/home).
function getCategory(sku: string): ItemCategory {
  const prefix = sku.slice(0, 3);
  if (prefix === 'B09') return 'electronics';
  if (prefix === 'B08') return 'fashion';
  if (prefix === 'B07') return 'home';
  return 'other';
}

export function computeRouting(inputs: RoutingInputs): RoutingComputed {
  const pricing = getPricing(inputs.sku);

  const profile: RoutingEvProfile = {
    grade: inputs.grade,
    reason: inputs.reason,
    sellerType: inputs.sellerType,
    sellerOptedIn: inputs.sellerType === '1P', // 3P not opted into local routing (mock)
    authenticityMatch: inputs.authenticityMatch,
    functionallyVerifiable: inputs.functionallyVerifiable,
    reasonGradeMismatch: inputs.reasonGradeMismatch ?? false,
    clearingPriceCents: pricing.residualValue * 100,
    localHandlingCents: pricing.localHandlingCost * 100,
    nearbyBuyers: pricing.nearbyBuyers,
    radiusKm: pricing.radiusKm,
    warehouseDistanceKm: WAREHOUSE_DISTANCE_KM,
    // Spec 016/016.1 — only wired when the caller supplies the doorstep signals;
    // point-grade eval cases never enter this branch (016.1 note: absolute EVs
    // shifted for everyone via the honest warehouse mixture — intended).
    ...(inputs.confidence !== undefined && {
      confidence: inputs.confidence,
      ...(inputs.grade && inputs.grade !== 'Salvage'
        ? { gradePosterior: posteriorFromPointGrade(inputs.grade, inputs.confidence) }
        : {}),
      category: getCategory(inputs.sku),
      nearestFcKm: NEAREST_FC_KM,
      sealed: inputs.packagingSealed ?? false,
      skuActive: true, // catalog lookup in prod; mock: known SKUs stay live
      // Spec 016.1: defect-level refurb + manifested-pallet + returnless inputs.
      defectTags: tagDefects(inputs.defects ?? []),
      manifestCoverage: 0.9, // ReLoop-graded item ⇒ near-full Health-Card manifest (mock)
      fraudSignal: inputs.wardrobingFlag ?? false,
      ...(inputs.customerTrust !== undefined && { customerTrust: inputs.customerTrust }),
    }),
  };

  const r = decideRoute(profile);

  // Spec 015: 1P only — for 1P inventory, evByPath's EV delta vs. warehouse IS
  // Amazon's own P&L, the real counterfactual the voucher formula is capped
  // against. 3P/SELL-flow keep the flat impact.ts formula (Phase 2 roadmap item
  // — see specs/015-carbon-inset-vouchers.md).
  const voucher =
    inputs.sellerType === '1P'
      ? computeReturnVoucherCredits(getCategory(inputs.sku), r.decision, r.co2SavedKg, r.evByPath)
      : null;

  return {
    decision: r.decision,
    sellerType: inputs.sellerType,
    fallbackChain: r.fallbackChain,
    dwellBudgetHours: r.dwellBudgetHours,
    ttlHours: r.ttlHours,
    co2SavedKg: r.co2SavedKg,
    residualValue: pricing.residualValue,
    localHandlingCost: pricing.localHandlingCost,
    nearbyBuyers: pricing.nearbyBuyers,
    radiusKm: pricing.radiusKm,
    evBreakdown: { hardRule: r.hardRule, chosen: r.decision, paths: r.evByPath },
    localMargin: Math.round(r.localMarginCents / 100),
    warehouseMargin: Math.round(r.warehouseMarginCents / 100),
    warehouseDistanceKm: r.warehouseDistanceKm,
    voucherEcoCredits: voucher?.ecoCredits,
    voucherFactors: voucher?.factors,
  };
}
