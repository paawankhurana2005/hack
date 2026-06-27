// Return-flow routing (Phase 3). Thin adapter over the shared EV engine: it builds a
// RoutingEvProfile from the return signals + a SKU-keyed economic profile (mock now;
// Location Service / the P2 model in prod), then `decideRoute` applies the hard
// constraint ladder and EV optimization. Same hard-rule decisions as before; the old
// soft rules are now an explainable value-vs-carbon optimization. computeRouting keeps
// its signature so route.ts + the eval harness are unchanged callers.

import type { ReturnGradingResult, ReturnReason, ReturnRoutingDecision, RoutingEvBreakdown } from '@reloop/shared';
import { decideRoute, type RoutingEvProfile } from '@reloop/shared';

export interface RoutingInputs {
  grade: ReturnGradingResult['grade'];
  reason: ReturnReason;
  sku: string;
  sellerType: '1P' | '3P';
  authenticityMatch: boolean;
  functionallyVerifiable: boolean;
  /** Optional fraud signal: claimed reason contradicts the observed grade. */
  reasonGradeMismatch?: boolean;
}

export interface RoutingComputed {
  decision: ReturnRoutingDecision['decision'];
  residualValue: number; // rupees (legacy display)
  localHandlingCost: number; // rupees
  nearbyBuyers: number;
  radiusKm: number;
  co2SavedKg: number;
  dwellBudgetHours: number;
  sellerType: '1P' | '3P';
  fallbackChain: ReturnRoutingDecision['decision'][];
  // Phase 3 additions:
  evBreakdown: RoutingEvBreakdown;
  localMargin: number; // rupees
  warehouseMargin: number; // rupees
  warehouseDistanceKm: number;
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

// Distance to the nearest fulfilment centre (km). Constant now; Location Service in prod.
const WAREHOUSE_DISTANCE_KM = 580;

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
  };

  const r = decideRoute(profile);

  return {
    decision: r.decision,
    sellerType: inputs.sellerType,
    fallbackChain: r.fallbackChain,
    dwellBudgetHours: r.dwellBudgetHours,
    co2SavedKg: r.co2SavedKg,
    residualValue: pricing.residualValue,
    localHandlingCost: pricing.localHandlingCost,
    nearbyBuyers: pricing.nearbyBuyers,
    radiusKm: pricing.radiusKm,
    evBreakdown: { hardRule: r.hardRule, chosen: r.decision, paths: r.evByPath },
    localMargin: Math.round(r.localMarginCents / 100),
    warehouseMargin: Math.round(r.warehouseMarginCents / 100),
    warehouseDistanceKm: r.warehouseDistanceKm,
  };
}
