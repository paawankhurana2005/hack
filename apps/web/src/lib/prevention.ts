// Return-prevention "model" (demo). Glass-box on purpose: the prediction is a
// deterministic lookup over historical return data baked into the catalog, so the
// point-of-purchase nudge is reproducible and can never fail mid-demo. In a later
// phase this resolves to an apps/api endpoint backed by a real return-rate model;
// the ReturnRiskPrediction contract (in @reloop/shared) stays the same.

import type { ReturnRiskLevel, ReturnRiskPrediction } from '@reloop/shared';
import { findStoreProduct } from '@/mock/store-products';

/** The predicted return risk for one variant of a product, or null if unknown. */
export function getReturnRisk(
  productId: string,
  variant: string,
): ReturnRiskPrediction | null {
  return findStoreProduct(productId)?.predictions?.[variant] ?? null;
}

/** Tailwind-friendly tone tokens per risk level — drives the panel's colour. */
export function riskTone(level: ReturnRiskLevel): {
  label: string;
  text: string;
  ring: string;
  bg: string;
  dot: string;
} {
  switch (level) {
    case 'high':
      return {
        label: 'High return risk',
        text: 'text-amber-400',
        ring: 'ring-amber-400/40',
        bg: 'bg-amber-400/10',
        dot: 'bg-amber-400',
      };
    case 'moderate':
      return {
        label: 'Some return risk',
        text: 'text-amber-300',
        ring: 'ring-amber-300/30',
        bg: 'bg-amber-300/5',
        dot: 'bg-amber-300',
      };
    case 'low':
    default:
      return {
        label: 'Low return risk',
        text: 'text-brand',
        ring: 'ring-brand/40',
        bg: 'bg-brand/10',
        dot: 'bg-brand',
      };
  }
}

/** 0..1 → "38%". */
export function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
