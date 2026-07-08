// Combined item list for the Sales Agent console (spec 026 UI redesign): every
// return the seller can see, split into the two pipelines the seller actually
// thinks in —
//   Return Pipeline: intake/routing in progress, no live pricing agent yet
//     (the hub hasn't dispatched it to local resale).
//   Rescue Pipeline:  dispatched to local resale — a real per-listing pricing
//     agent (agent-store.ts) is watching and repricing it.
// A return moves from the first bucket to the second the moment `listingId`
// is set (birthAgentFromReturn() -> linkListing()), so that field alone is
// the split — no new status field needed.

import { getSubmittedReturns, type SubmittedReturn } from '@/lib/mocks/return-store';
import { getReturnListings } from '@/lib/return-market';
import { getAgentState, type AgentState } from '@/lib/agent-store';
import type { CasualListing } from '@/mock/casual-listings';
import type { ReturnRoutingDecision } from '@reloop/shared';

// Duplicated from apps/web/src/app/seller/returns/[returnId]/SellerReturnDetail.tsx
// (module-local consts there, not exported) — same source of truth, kept in
// sync by hand since these are small, stable label maps.
export const ROUTE_LABEL: Record<ReturnRoutingDecision['decision'], string> = {
  restock: 'Direct Restock',
  local_resale: 'Local Buyer Match',
  refurbish: 'Local Refurbishment',
  liquidate: 'Hub Pallet (Manifested)',
  donate: 'Local Donation',
  recycle: 'Local Recycling',
  warehouse: 'Warehouse Return',
  return_to_seller: 'Return to Seller',
  returnless_refund: 'Keep It — Refund Issued',
};

export const STATUS_STYLE: Record<SubmittedReturn['status'], { label: string; cls: string }> = {
  pending_seller_approval: { label: 'Needs your approval', cls: 'bg-warning/20 text-warning' },
  awaiting_pickup: { label: 'Awaiting pickup', cls: 'bg-brand/15 text-brand' },
  in_transit: { label: 'In transit', cls: 'bg-warning/15 text-warning' },
  seller_approved: { label: 'Routed to buyer', cls: 'bg-success/15 text-success' },
  deal_completed: { label: 'Deal closed', cls: 'bg-success/20 text-success' },
  processed: { label: 'Processed', cls: 'bg-success/15 text-success' },
};

export interface ReturnPipelineItem {
  returnId: string;
  productName: string;
  status: SubmittedReturn['status'];
  routingDecision: ReturnRoutingDecision | null;
}

export interface RescuePipelineItem {
  listing: CasualListing;
  /** null until the listing's agent has been opened once (lazily initialised
   *  by ensureAgent() — the console does that on selection). The queue still
   *  shows the listing's own listed price/status as a preview until then,
   *  same fallback local-listings/page.tsx's queue already uses. */
  agent: AgentState | null;
}

export interface SalesAgentItems {
  returnPipeline: ReturnPipelineItem[];
  rescuePipeline: RescuePipelineItem[];
}

export function getSalesAgentItems(sellerId: string): SalesAgentItems {
  const allReturnListings = getReturnListings();
  // `listingId` is the intended "already dispatched" signal (set by
  // linkListing() the moment birthAgentFromReturn() runs), but some
  // historical demo records predate that write and never got backfilled —
  // cross-check against real return-sourced listings too so a return that
  // genuinely has a live agent never also shows as "not yet dispatched".
  const dispatchedReturnIds = new Set(allReturnListings.map((l) => l.returnId).filter((id): id is string => !!id));

  const returnPipeline = getSubmittedReturns()
    .filter((r) => !r.listingId && !dispatchedReturnIds.has(r.returnId))
    .map((r) => ({
      returnId: r.returnId,
      productName: r.productName,
      status: r.status,
      routingDecision: r.routingDecision,
    }));

  const rescuePipeline = allReturnListings
    .filter((l) => l.sellerId === sellerId)
    .map((listing) => ({ listing, agent: getAgentState(listing.id) }));

  return { returnPipeline, rescuePipeline };
}
