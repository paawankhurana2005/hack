import type { ReturnGradingResult, ReturnReason, ReturnRoutingDecision } from '@reloop/shared';

export interface RoutingInputs {
  grade: ReturnGradingResult['grade'];
  reason: ReturnReason;
  sku: string;
  sellerType: '1P' | '3P';
  authenticityMatch: boolean;
  functionallyVerifiable: boolean;
}

export interface RoutingComputed {
  decision: ReturnRoutingDecision['decision'];
  residualValue: number;
  localHandlingCost: number;
  nearbyBuyers: number;
  radiusKm: number;
  co2SavedKg: number;
  dwellBudgetHours: number;
  sellerType: '1P' | '3P';
  fallbackChain: ReturnRoutingDecision['decision'][];
}

interface MockPricing {
  residualValue: number;
  localHandlingCost: number;
  nearbyBuyers: number;
  radiusKm: number;
  co2SavedKg: number;
}

function getPricing(sku: string): MockPricing {
  const prefix = sku.slice(0, 3);
  if (prefix === 'B09') {
    return { residualValue: 2499, localHandlingCost: 380, nearbyBuyers: 8, radiusKm: 4, co2SavedKg: 2.4 };
  }
  if (prefix === 'B08') {
    return { residualValue: 799, localHandlingCost: 220, nearbyBuyers: 5, radiusKm: 3, co2SavedKg: 0.8 };
  }
  if (prefix === 'B07') {
    return { residualValue: 599, localHandlingCost: 180, nearbyBuyers: 4, radiusKm: 3, co2SavedKg: 0.6 };
  }
  return { residualValue: 500, localHandlingCost: 300, nearbyBuyers: 2, radiusKm: 5, co2SavedKg: 0.5 };
}

function dwellFor(decision: ReturnRoutingDecision['decision']): number {
  if (decision === 'local_resale') return 48;
  if (decision === 'refurbish') return 72;
  if (decision === 'donate') return 96;
  return 0;
}

function fallbackFor(decision: ReturnRoutingDecision['decision']): ReturnRoutingDecision['decision'][] {
  if (decision === 'local_resale') return ['donate', 'recycle'];
  if (decision === 'refurbish') return ['warehouse'];
  if (decision === 'donate') return ['recycle'];
  return [];
}

export function computeRouting(inputs: RoutingInputs): RoutingComputed {
  const { grade, reason, sku, sellerType, authenticityMatch, functionallyVerifiable } = inputs;
  const pricing = getPricing(sku);
  const margin = pricing.residualValue - pricing.localHandlingCost;

  let decision: ReturnRoutingDecision['decision'];

  // Rules applied in order; first match wins
  if (sellerType === '3P') {
    decision = 'return_to_seller';
  } else if (reason === 'counterfeit' || reason === 'not_as_described') {
    decision = 'return_to_seller';
  } else if (reason === 'wrong_item') {
    decision = 'warehouse';
  } else if (!authenticityMatch) {
    decision = 'warehouse';
  } else if (grade === 'Salvage' || grade === null) {
    decision = 'recycle';
  } else if (reason === 'arrived_damaged') {
    decision = 'recycle';
  } else if (margin < 300) {
    decision = 'donate';
  } else if (!functionallyVerifiable) {
    decision = 'refurbish';
  } else if (margin >= 300 && pricing.nearbyBuyers >= 3) {
    decision = 'local_resale';
  } else {
    decision = 'warehouse';
  }

  const savesCarbon = decision === 'local_resale' || decision === 'donate';
  return {
    decision,
    sellerType,
    fallbackChain: fallbackFor(decision),
    dwellBudgetHours: dwellFor(decision),
    co2SavedKg: savesCarbon ? pricing.co2SavedKg : 0,
    residualValue: pricing.residualValue,
    localHandlingCost: pricing.localHandlingCost,
    nearbyBuyers: pricing.nearbyBuyers,
    radiusKm: pricing.radiusKm,
  };
}
