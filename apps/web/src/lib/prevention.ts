// Return-prevention "model" (demo). Glass-box on purpose: the prediction is a
// deterministic lookup over historical return data baked into the catalog, so the
// point-of-purchase nudge is reproducible and can never fail mid-demo. In a later
// phase this resolves to an apps/api endpoint backed by a real return-rate model;
// the ReturnRiskPrediction contract (in @reloop/shared) stays the same.

import type { ReturnRiskLevel, ReturnRiskPrediction } from '@reloop/shared';
import {
  confidenceFor,
  featuresFor,
  predictReturnProb,
  reasonDistribution,
  riskLevelFor,
} from '@reloop/shared';
import { findStoreProduct, type StoreProduct } from '@/mock/store-products';

/** Predicted return for one sized variant, computed by the real classifier. */
function predictVariant(product: StoreProduct, variant: string): ReturnRiskPrediction | null {
  const sizes = product.sizes;
  if (!sizes || sizes.length < 2) return null;
  const idx = sizes.indexOf(variant);
  if (idx === -1) return null;

  const probFor = (sizeIndex: number): number =>
    predictReturnProb(
      featuresFor({
        category: product.category,
        sizeIndex,
        sizeCount: sizes.length,
        priceCents: product.price.amountCents,
        rating: product.rating,
        ratingCount: product.ratingCount,
      }),
    );

  const prob = probFor(idx);
  const features = featuresFor({
    category: product.category,
    sizeIndex: idx,
    sizeCount: sizes.length,
    priceCents: product.price.amountCents,
    rating: product.rating,
    ratingCount: product.ratingCount,
  });

  // Cross-variant nudge: the lowest-risk size, if meaningfully safer than this one.
  let bestIdx = idx;
  let bestProb = prob;
  sizes.forEach((_, i) => {
    const p = probFor(i);
    if (p < bestProb) {
      bestProb = p;
      bestIdx = i;
    }
  });
  const recommendation =
    bestIdx !== idx && prob - bestProb >= 0.05
      ? {
          variantLabel: `Size ${sizes[bestIdx]!}`,
          returnRate: bestProb,
          rationale: `Most returns of size ${variant} are fit-related — size ${sizes[bestIdx]!} comes back less often.`,
        }
      : undefined;

  return {
    variantLabel: `Size ${variant}`,
    riskLevel: riskLevelFor(prob),
    returnRate: prob,
    confidence: confidenceFor(product.ratingCount),
    reasons: reasonDistribution(features).slice(0, 3),
    ...(recommendation ? { recommendation } : {}),
  };
}

/**
 * Predicted return risk for one variant. Curated authored predictions (real
 * historical labels for the hero product) take precedence; otherwise the real
 * classifier generalizes prevention to every other sized product. Returns null when
 * there's no variant to reason about.
 */
export function getReturnRisk(
  productId: string,
  variant: string,
): ReturnRiskPrediction | null {
  const product = findStoreProduct(productId);
  if (!product) return null;
  const authored = product.predictions?.[variant];
  if (authored) return authored;
  return predictVariant(product, variant);
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
