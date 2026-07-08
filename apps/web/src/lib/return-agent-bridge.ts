// Spec 026: the single place a return becomes a live Listing-Agent-driven
// marketplace listing. Extracted from seller/hub/page.tsx's original
// birthReturnListing() so BOTH seller-approval flows — the hub-bench
// checkpoint (seller/hub) and the direct seller-returns approval
// (seller/returns/[returnId]) — mint the exact same kind of listing instead
// of only one of them ever reaching the Sales Agent.
//
// IMPORTANT: `itemId: item_ret_${returnId}` is a load-bearing convention —
// agent-store.ts's decideViaEngine() special-cases this exact prefix to
// resolve REAL geo-demand for the pricing engine. Changing it silently
// degrades return-sourced listings back to placeholder geo data.

import type { ConditionGrade, Grade, ItemCategory, Money } from '@reloop/shared';
import { estimateImpact } from '@reloop/shared';
import { addListing } from '@/lib/listings-store';
import { ensureAgent } from '@/lib/agent-store';
import { createReturnHealthCard } from '@/lib/api-client';
import { demandCurve, SKU_TO_STORE_PRODUCT } from '@/lib/demand-graph';
import { findStoreProduct } from '@/mock/store-products';
import { currentAccountId } from '@/lib/storage';
import { getAccount } from '@/lib/accounts';
import type { CasualListing } from '@/mock/casual-listings';
import { linkListing, type SubmittedReturn } from '@/lib/mocks/return-store';

export function categoryOf(r: SubmittedReturn): ItemCategory {
  if (r.category === 'electronics') return 'electronics';
  if (r.category === 'apparel') return 'fashion';
  if (r.category === 'kitchenware') return 'home';
  return 'other';
}

// Return grade → the marketplace's condition vocabulary.
const CONDITION_OF: Record<Grade, ConditionGrade> = {
  A: 'like-new',
  B: 'good',
  C: 'fair',
  Salvage: 'poor',
};

// Open-box list price as a fraction of new retail, by verified grade.
export const LIST_FRAC: Record<Grade, number> = { A: 0.78, B: 0.68, C: 0.55, Salvage: 0.35 };

export const round50 = (paise: number) => Math.max(5000, Math.round(paise / 5000) * 5000);
const money = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

export interface BirthAgentFromReturnParams {
  ret: SubmittedReturn;
  /** The verified (or doorstep-AI) grade to list at. */
  grade: Grade;
  /** Just the two fields the floor calc needs — either RoutingEvProfile's
   *  evByPath or a ReturnRoutingDecision.evBreakdown.paths array satisfies this. */
  evByPath: { path: string; evCents: number }[];
  packagingSealed: boolean;
  radiusKm?: number;
  /** Spec 023: a seller's own call on a "slightly damaged but resellable" item —
   *  overrides the engine's grade-based default list price, and becomes a floor. */
  sellerApprovedPriceCents?: number;
  /** ISO timestamp of the driver's pickup scan, if any — feeds the Health Card history. */
  driverScanAt?: string;
}

/**
 * Spec 016 Stage 7 (generalized, spec 026): births the autonomous executor for
 * a return — a real marketplace listing (buyable by other accounts) plus a
 * Listing Agent instance whose floor is the routing engine's route-elsewhere
 * (warehouse/liquidate) value, so the agent escalates back to the Bridge
 * exactly when local resale stops beating "send it up the chain".
 */
export async function birthAgentFromReturn(params: BirthAgentFromReturnParams): Promise<string> {
  const { ret, grade, evByPath, packagingSealed, sellerApprovedPriceCents, driverScanAt } = params;
  const category = categoryOf(ret);
  const retailCents = ret.priceCents;
  const listedCents = sellerApprovedPriceCents ?? round50(retailCents * LIST_FRAC[grade]);
  const comparableCents = Math.round(retailCents * 0.6); // same clearing proxy the bench profile uses
  const storeProductId = ret.sku ? SKU_TO_STORE_PRODUCT[ret.sku] : undefined;
  const storeProduct = storeProductId ? findStoreProduct(storeProductId) : undefined;

  // Floor = what the item is worth if the agent gives up locally — the better of
  // the warehouse linehaul and the manifested hub pallet, clamped to a sane band
  // under list. A seller-approved price is a floor, never just a starting point.
  const salvageEv = Math.max(
    evByPath.find((p) => p.path === 'warehouse')?.evCents ?? 0,
    evByPath.find((p) => p.path === 'liquidate')?.evCents ?? 0,
  );
  const floorCents = Math.max(
    Math.round(listedCents * 0.4),
    Math.min(Math.max(0, salvageEv), Math.round(listedCents * 0.85)),
    sellerApprovedPriceCents ?? 0,
  );

  const dg = demandCurve({
    category,
    priceCents: listedCents,
    retailCents,
    radiusKm: params.radiusKm ?? 4,
    sku: ret.sku,
    storeProductId,
  });

  const now = new Date().toISOString();
  const listingId = `lst_ret_${ret.returnId}`;
  const itemId = `item_ret_${ret.returnId}`;
  const sellerId = currentAccountId();

  // Regenerate the Health Card's narrative summary against the verified
  // evidence rather than reusing the doorstep-time card. Falls back to a
  // deterministic template so dispatch is never blocked on an LLM call.
  let cardSummary = `Doorstep-graded ${grade}, verified before listing. ${
    ret.gradingResult?.defects[0] ?? 'No notable defects.'
  }`;
  try {
    const card = await createReturnHealthCard({
      gradingResult: {
        grade,
        confidence: 0.98,
        defects: ret.gradingResult?.defects ?? [],
        authenticityMatch: ret.gradingResult?.authenticityMatch ?? true,
        wardrobingFlag: ret.gradingResult?.wardrobingFlag ?? false,
        functionallyVerifiable: ret.gradingResult?.functionallyVerifiable ?? true,
        rawReason: ret.reason,
      },
    });
    if (!('fallback' in card)) cardSummary = card.summary;
  } catch {
    // Enrichment only — the hand-built summary above is a perfectly good fallback.
  }

  const listing: CasualListing = {
    id: listingId,
    itemId,
    title: ret.productName,
    imageUrl: storeProduct?.imageUrl ?? ret.photoUrls?.[0] ?? '',
    listedPrice: money(listedCents),
    status: 'listed',
    views: 0,
    listedAt: now,
    sellerId,
    sellerName: getAccount(sellerId)?.name ?? 'ReLoop Local Hub',
    originalPrice: money(retailCents),
    card: {
      id: `hc_${ret.returnId}`,
      productId: storeProductId ?? ret.orderId,
      itemId,
      title: ret.productName,
      grade: CONDITION_OF[grade],
      confidence: 0.98,
      summary: cardSummary,
      detectedIssues: ret.gradingResult?.defects ?? [],
      authenticityVerified: ret.gradingResult?.authenticityMatch ?? true,
      packagingSealed,
      listingPrice: money(listedCents),
      history: [
        { label: 'Graded at the doorstep', at: ret.submittedAt },
        ...(driverScanAt ? [{ label: 'Driver verified at pickup', at: driverScanAt }] : []),
        { label: 'Verified · ready to list', at: now },
      ],
      healthCardUrl: `/card/${itemId}`,
      issuedAt: now,
    },
    impact: estimateImpact(category, money(listedCents)),
    category,
    grade: CONDITION_OF[grade],
    floorCents,
    retailCents,
    market: {
      comparableCents,
      localDemand: dg.localDemand,
      holdingCostPerDayCents: Math.max(2000, Math.round(listedCents * 0.01)),
      baseViewsPerDay: dg.baseViewsPerDay,
    },
    returnId: ret.returnId,
    storeProductId,
  };

  addListing(listing);
  ensureAgent(listing);
  linkListing(ret.returnId, listingId);
  return listingId;
}
