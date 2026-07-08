'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getReturnById,
  approveReturn,
  completeDeal,
  applySellerRouteChoice,
  saveReturn,
  type SubmittedReturn,
} from '@/lib/mocks/return-store';
import { createLocalRoutingListing, RESCUE_WINDOW_HOURS } from '@/lib/mocks/exchange-store';
import { upsertReturnRecord, initiateMatching, ApiRequestError } from '@/lib/api-client';
import { earnSeller } from '@/lib/credits-store';
import { currentAccountId } from '@/lib/storage';
import { birthAgentFromReturn } from '@/lib/return-agent-bridge';
import { Card } from '@/components/ui/card';
import { ReturnHealthCardDeep } from '@/components/return/health-card';
import { CascadeTimeline } from '@/components/matching/cascade-timeline';
import type { Grade, ReturnRoutingDecision } from '@reloop/shared';

interface Props {
  returnId: string;
}

const GRADE_STYLE: Record<string, string> = {
  A: 'bg-success/20 text-success border-success/30',
  B: 'bg-warning/20 text-warning border-warning/30',
  C: 'bg-brand/20 text-brand border-brand/30',
  Salvage: 'bg-danger/20 text-danger border-danger/30',
};

// Spec 026: the seller's own menu of routes — every viable path from the
// same EV breakdown already shown in the Intelligent Bridge card, not just
// "local resale vs warehouse". The seller inspecting a return decides what
// happens to it; the AI's pick is a recommendation, not the only option.
const ROUTE_LABEL: Record<ReturnRoutingDecision['decision'], string> = {
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

const STATUS_STYLE: Record<SubmittedReturn['status'], { label: string; cls: string }> = {
  pending_seller_approval: { label: 'Needs your approval', cls: 'bg-warning/20 text-warning' },
  awaiting_pickup: { label: 'Awaiting pickup', cls: 'bg-brand/15 text-brand' },
  in_transit: { label: 'In transit', cls: 'bg-warning/15 text-warning' },
  seller_approved: { label: 'Routed to buyer', cls: 'bg-success/15 text-success' },
  deal_completed: { label: 'Deal closed', cls: 'bg-success/20 text-success' },
  processed: { label: 'Processed', cls: 'bg-success/15 text-success' },
};

function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

// routing.localMargin/warehouseMargin come from the routing engine in rupees
// (apps/api/src/lib/routing-engine.ts), not cents — a separate formatter from
// formatPrice() (which is for genuinely-cents fields like priceCents) avoids
// re-introducing the /100-twice bug this replaced.
function formatRupees(rupees: number) {
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function computeEcoCredits(category: string, priceCents: number): number {
  const CO2_KG: Record<string, number> = {
    electronics: 25, home: 15, fashion: 8, sports: 6, toys: 4, books: 1,
  };
  const co2 = CO2_KG[category] ?? 5;
  const rupees = priceCents / 100;
  return Math.round(co2 * 3 + rupees * 0.002);
}

export function SellerReturnDetail({ returnId }: Props) {
  const [ret, setRet] = useState<SubmittedReturn | null | 'loading'>('loading');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [matchInfo, setMatchInfo] = useState<{ candidateCount: number; sessionId: string } | null>(null);
  // Spec 026: non-blocking — matching/Mongo already succeeded by the time this
  // runs, so a failure here shouldn't undo the approval, just flag it.
  const [agentWarning, setAgentWarning] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => {
    setRet(getReturnById(returnId));
  }, [returnId]);

  if (ret === 'loading') {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 rounded-lg bg-secondary" />
        <div className="h-56 w-full rounded-2xl bg-secondary" />
        <div className="h-48 w-full rounded-2xl bg-secondary" />
      </div>
    );
  }

  if (!ret) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Return not found.</p>
        <Link href="/seller/returns" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Back to returns queue
        </Link>
      </div>
    );
  }

  const grading = ret.gradingResult;
  const routing = ret.routingDecision;
  const status = STATUS_STYLE[ret.status];
  const gradeCls = grading?.grade ? GRADE_STYLE[grading.grade] : 'bg-secondary text-muted-foreground border-border';
  const ecoCredits = computeEcoCredits(ret.category, ret.priceCents);

  const isPendingApproval = ret.status === 'pending_seller_approval';
  const isSellerApproved = ret.status === 'seller_approved';
  const isDealComplete = ret.status === 'deal_completed';
  // Spec 026: the seller's route picker needs to show for EVERY return still
  // awaiting a dispatch decision, not just the ones the AI itself routed to
  // local_resale (the only path that starts in 'pending_seller_approval') —
  // otherwise a donate/refurbish/recycle/liquidate recommendation would never
  // give the seller a chance to pick anything at all.
  const needsSellerDecision = isPendingApproval || ret.status === 'awaiting_pickup';

  // Spec 022: approval is now a real, sequenced backend action — the return
  // record must land before matching is initiated (initiateMatchSession looks
  // it up by returnId and needs its pincode), and neither call is swallowed
  // anymore. Local status only flips once matching has actually started, so
  // the seller is never shown a false "approved" state.
  async function handleApprove() {
    if (!ret || ret === 'loading') return;
    const currentRet = ret;
    const currentGrading = grading;
    const currentRouting = routing;

    if (!currentGrading?.grade || currentGrading.grade === 'Salvage' || !currentRouting) {
      setApproveError('This return is missing the grading data needed to start local matching.');
      return;
    }

    setApproving(true);
    setApproveError(null);
    setMatchInfo(null);

    // Spec 026: the seller can dispatch to local_resale even when it wasn't
    // the AI's own recommendation (picked from an alternative row) — persist
    // that as the real decision before the approval flow below, which reads
    // routing back from the store fresh at each step.
    if (currentRouting.decision !== 'local_resale') {
      applySellerRouteChoice(
        currentRet.returnId,
        {
          ...currentRouting,
          decision: 'local_resale',
          evBreakdown: currentRouting.evBreakdown
            ? { ...currentRouting.evBreakdown, chosen: 'local_resale' }
            : undefined,
        },
        `Seller dispatched to ${ROUTE_LABEL.local_resale} instead of the recommended ${ROUTE_LABEL[currentRouting.decision]}`,
      );
    }

    try {
      const nowMs = Date.now();
      await upsertReturnRecord({
        returnId: currentRet.returnId,
        productName: currentRet.productName,
        category: currentRet.category.toLowerCase(),
        // No pincode on returns yet — default to a launch zone for the demo.
        region_cluster: 'Bengaluru',
        pincode: '560001',
        base_price: Math.round(currentRet.priceCents / 100),
        // condition_score is a placeholder until AI grading confidence is threaded here.
        condition_score: 0.7,
        listing_created_at: new Date(nowMs).toISOString(),
        pickup_deadline: new Date(nowMs + RESCUE_WINDOW_HOURS * 3600_000).toISOString(),
        grade: currentGrading.grade,
        sellerId: currentAccountId(),
      });

      const match = await initiateMatching(currentRet.returnId);
      setMatchInfo({ candidateCount: match.candidateCount, sessionId: match.sessionId });

      const updated = approveReturn(currentRet.returnId);
      if (updated) {
        setRet(updated);
        createLocalRoutingListing({
          returnId: currentRet.returnId,
          productName: currentRet.productName,
          category: currentRet.category,
          grade: currentGrading.grade as 'A' | 'B' | 'C',
          priceCents: currentRet.priceCents,
          nearbyBuyers: currentRouting.nearbyBuyers ?? 4,
          radiusKm: currentRouting.radiusKm ?? 5,
          co2SavedKg: currentRouting.co2SavedKg ?? 2.4,
          distanceSavedKm: currentRouting.warehouseDistanceKm ?? 580,
          imageUrl: currentRet.photoUrls?.[0],
        });

        // Spec 026: also birth the Listing/Sales Agent's real marketplace
        // listing — previously only the seller/hub bench-approval path did
        // this, so a return approved here was invisible to the Sales Agent.
        try {
          await birthAgentFromReturn({
            ret: updated,
            grade: currentGrading.grade as Grade,
            evByPath: currentRouting.evBreakdown?.paths ?? [],
            packagingSealed: currentGrading.packagingSealed ?? false,
            radiusKm: currentRouting.radiusKm ?? 5,
          });
        } catch {
          setAgentWarning(
            'Local listing created, but the Sales Agent couldn’t start — refresh to retry.',
          );
        }
      }
    } catch (err) {
      setApproveError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not start local buyer matching. Please try again.',
      );
    } finally {
      setApproving(false);
    }
  }

  function handleSendToWarehouse() {
    if (!ret || ret === 'loading' || !routing) return;
    // Spec 026: persist the decision swap too when warehouse wasn't already
    // the AI's own recommendation — otherwise the stored decision would keep
    // saying (e.g.) "donate" even though the seller actually sent it to the
    // warehouse.
    const base =
      routing.decision !== 'warehouse'
        ? applySellerRouteChoice(
            ret.returnId,
            {
              ...routing,
              decision: 'warehouse',
              evBreakdown: routing.evBreakdown ? { ...routing.evBreakdown, chosen: 'warehouse' } : undefined,
            },
            `Seller sent to warehouse instead of the recommended ${ROUTE_LABEL[routing.decision]}`,
          )
        : ret;
    if (!base) return;
    const updated: SubmittedReturn = { ...base, status: 'in_transit' };
    saveReturn(updated);
    setRet(updated);
  }

  // Spec 026: the seller dispatches to any other VIABLE route from the same
  // EV breakdown — refurbish, donate, recycle, liquidate, etc. `local_resale`
  // goes through handleApprove() (real matching/agent flow) and `warehouse`
  // through handleSendToWarehouse() above; this covers the rest.
  function handleChooseOtherRoute(path: ReturnRoutingDecision['decision']) {
    if (!ret || ret === 'loading' || !routing?.evBreakdown) return;
    const target = routing.evBreakdown.paths.find((p) => p.path === path);
    if (!target || !target.viable) return;

    const wasRecommended = path === routing.decision;
    const newDecision: ReturnRoutingDecision = {
      ...routing,
      decision: path,
      evBreakdown: { ...routing.evBreakdown, chosen: path },
    };
    const note = wasRecommended
      ? `Seller confirmed the recommended ${ROUTE_LABEL[path]}`
      : `Seller dispatched to ${ROUTE_LABEL[path]} instead of the recommended ${ROUTE_LABEL[routing.decision]}`;
    const updated = applySellerRouteChoice(ret.returnId, newDecision, note);
    if (updated) setRet(updated);
  }

  function handleDealComplete() {
    if (!ret || ret === 'loading') return;
    const currentRet = ret;
    setCompleting(true);
    setTimeout(() => {
      const updated = completeDeal(currentRet.returnId, ecoCredits);
      if (updated) {
        earnSeller(ecoCredits, `Deal closed — ${currentRet.productName}`);
        setRet(updated);
      }
      setCompleting(false);
    }, 600);
  }

  return (
    <div className="space-y-5">
      {/* Back */}
        <Link href="/seller/returns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand">
          ← Returns queue
        </Link>

        {/* Product header — image left, info right (Amazon-style) */}
        {(() => {
          const photos = ret.photoUrls ?? [];
          const total = photos.length;
          const safeIdx = Math.min(photoIdx, total - 1);
          const prev = () => setPhotoIdx((i) => (i - 1 + total) % total);
          const next = () => setPhotoIdx((i) => (i + 1) % total);

          return (
            <div className="flex overflow-hidden rounded-2xl bg-card ring-1 ring-hairline shadow-[0_1px_2px_rgba(35,47,62,0.04)]">
              {/* LEFT — image */}
              <div className="relative w-72 shrink-0 bg-secondary/40">
                {total > 0 ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={safeIdx}
                      src={photos[safeIdx]}
                      alt={`${ret.productName} — photo ${safeIdx + 1} of ${total}`}
                      className="h-full min-h-64 w-full object-contain"
                    />
                    {total > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={prev}
                          className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                          aria-label="Previous photo"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={next}
                          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                          aria-label="Next photo"
                        >
                          ›
                        </button>
                        <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                          {safeIdx + 1} / {total}
                        </div>
                      </>
                    )}
                    {/* Dot indicators */}
                    {total > 1 && (
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                        {photos.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setPhotoIdx(i)}
                            className={`h-1.5 rounded-full transition-all ${i === safeIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
                            aria-label={`Photo ${i + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full min-h-64 w-full items-center justify-center text-5xl text-muted-foreground">
                    📦
                  </div>
                )}
              </div>

              {/* RIGHT — product info */}
              <div className="flex flex-1 flex-col justify-between p-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Return detail
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {ret.returnId} · {ret.category}
                  </p>
                  <h1 className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-foreground">
                    {ret.productName}
                  </h1>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {grading?.grade && (
                      <span className={`rounded-xl border-2 px-3 py-1 text-sm font-bold tracking-wide ${gradeCls}`}>
                        Grade {grading.grade}
                      </span>
                    )}
                    <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>

                  <p className="mt-4 text-2xl font-bold text-brand tabular-nums">
                    {formatPrice(ret.priceCents)}
                  </p>
                </div>

                <div className="mt-6 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    Submitted {formatDateTime(ret.submittedAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {total > 0 ? `${total} photo${total !== 1 ? 's' : ''} submitted by buyer` : `${ret.photoCount} photo${ret.photoCount !== 1 ? 's' : ''} — graded in person at pickup`}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Deal complete celebration ── */}
        {isDealComplete && (
          <div className="rounded-2xl border border-success/40 bg-success/10 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-success/20 text-2xl">
                🎉
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-success">Deal closed</p>
                <p className="mt-1 text-xl font-bold text-foreground">Local buyer match confirmed</p>
                {ret.dealCompletedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Completed {formatDateTime(ret.dealCompletedAt)}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-success/10 p-3 text-center">
                <p className="text-xs text-muted-foreground">EcoCredits earned</p>
                <p className="mt-1 text-2xl font-bold text-success">+{ret.ecoCreditsAwarded}</p>
              </div>
              {routing?.co2SavedKg ? (
                <div className="rounded-xl bg-success/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground">CO₂ avoided</p>
                  <p className="mt-1 text-2xl font-bold text-success">{routing.co2SavedKg}kg</p>
                </div>
              ) : null}
              {routing?.localMargin !== undefined && (
                <div className="rounded-xl bg-success/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Value recovered</p>
                  <p className="mt-1 text-2xl font-bold text-success">+{formatRupees(routing.localMargin)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Action required banner — the actual choice now lives in the
            Intelligent Bridge card below, where all the routes already are ── */}
        {needsSellerDecision && (
          <div className="rounded-2xl border-2 border-warning/40 bg-warning/5 p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-warning">
                  Action required
                </p>
                <p className="mt-0.5 text-sm text-foreground">
                  This item is graded and routed — pick how to handle it in the Intelligent Bridge
                  breakdown below. The AI's recommendation is highlighted; you can dispatch to any
                  other viable route instead.
                </p>
              </div>
            </div>

            {approveError && (
              <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-4">
                <p className="text-sm font-semibold text-danger">Approval didn't go through</p>
                <p className="mt-1 text-sm text-muted-foreground">{approveError}</p>
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  className="mt-3 rounded-lg border border-danger/40 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger/10"
                >
                  Try again
                </button>
              </div>
            )}

            {agentWarning && (
              <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4">
                <p className="text-sm text-warning">{agentWarning}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Post-approval: awaiting deal ── */}
        {isSellerApproved && (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20 text-success">
                ✓
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">Local listing created</p>
                {ret.sellerApprovedAt && (
                  <p className="text-xs text-muted-foreground">
                    Approved {formatDateTime(ret.sellerApprovedAt)}
                  </p>
                )}
                {matchInfo && (
                  <p className="mt-1 text-sm font-semibold text-success">
                    Matching started — {matchInfo.candidateCount} local buyer
                    {matchInfo.candidateCount === 1 ? '' : 's'} notified.
                  </p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  The rescue pipeline is now finding a local buyer and adjusting pricing.
                  Track progress in{' '}
                  <Link href="/seller/listings" className="font-semibold text-success hover:underline">
                    My Listings
                  </Link>
                  .
                </p>
                <CascadeTimeline returnId={ret.returnId} />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={completing}
                onClick={handleDealComplete}
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
              >
                {completing ? 'Confirming…' : 'Mark Deal as Complete'}
              </button>
            </div>
          </div>
        )}

        {/* ── Product Health Card — the full trust document, right on the
            page. Not hidden behind a click: this IS the AI grading report. ── */}
        <ReturnHealthCardDeep
          productName={ret.productName}
          returnId={ret.returnId}
          grading={grading}
          healthCard={ret.healthCard}
          transitions={ret.transitions}
          submittedAt={ret.submittedAt}
        />

        {/* ── Intelligent Bridge — glass-box EV breakdown ── */}
        {routing?.evBreakdown && (
          <Card className="border-l-2 border-l-brand">
            <div className="mb-1 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-brand" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                Intelligent Bridge — why {routing.decision.replace(/_/g, ' ')}
              </p>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">{routing.reasoning}</p>
            {needsSellerDecision && (
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-warning">
                Pick how to handle this return — the AI's recommendation is highlighted
              </p>
            )}
            <div className="space-y-2">
              {[...routing.evBreakdown.paths]
                .sort((a, b) => b.evCents - a.evCents)
                .map((p) => {
                  const isChosen = p.path === routing.evBreakdown!.chosen;
                  const canDispatch = needsSellerDecision && p.viable;
                  function dispatch() {
                    if (p.path === 'local_resale') void handleApprove();
                    else if (p.path === 'warehouse') handleSendToWarehouse();
                    else handleChooseOtherRoute(p.path);
                  }
                  return (
                    <div key={p.path} className="space-y-1">
                      <div
                        className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                          isChosen ? 'bg-brand/10 ring-1 ring-brand/40' : 'bg-secondary/50'
                        } ${p.viable ? '' : 'opacity-60'}`}
                      >
                        <span className="text-sm capitalize text-foreground">
                          {isChosen && '✓ '}
                          {p.path.replace(/_/g, ' ')}
                        </span>
                        <span className="flex items-center gap-3">
                          <span
                            className={`font-mono text-sm tabular-nums ${
                              p.evCents >= 0 ? 'text-foreground' : 'text-danger'
                            }`}
                          >
                            {p.evCents >= 0 ? '+' : '−'}
                            {formatPrice(Math.abs(p.evCents))}
                          </span>
                          {canDispatch && (
                            <button
                              type="button"
                              disabled={approving}
                              onClick={dispatch}
                              className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${
                                isChosen
                                  ? 'bg-brand text-brand-foreground'
                                  : 'border border-brand/40 text-brand hover:bg-brand/10'
                              }`}
                            >
                              {isChosen ? 'Confirm & dispatch' : 'Choose instead'}
                            </button>
                          )}
                        </span>
                      </div>
                      {!p.viable && p.gateReason && (
                        <p className="px-3 text-xs text-muted-foreground">{p.gateReason}</p>
                      )}
                    </div>
                  );
                })}
            </div>
            {routing.evBreakdown.hardRule && (
              <p className="mt-3 text-xs text-muted-foreground">
                Hard rule applied: {routing.evBreakdown.hardRule}
              </p>
            )}
          </Card>
        )}

        {/* ── Economic summary — only visible after seller approves ── */}
        {(isSellerApproved || isDealComplete) && routing && (routing.localMargin !== undefined || routing.warehouseMargin !== undefined) && (
          <Card>
            <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Economic summary
            </p>
            <div className="grid grid-cols-2 gap-4">
              {routing.localMargin !== undefined && (
                <div className="rounded-xl bg-success/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground">Local route net</p>
                  <p className="mt-1 text-2xl font-bold text-success">+{formatRupees(routing.localMargin)}</p>
                </div>
              )}
              {routing.warehouseMargin !== undefined && (
                <div className="rounded-xl bg-danger/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground">Warehouse route net</p>
                  <p className="mt-1 text-2xl font-bold text-danger">−{formatRupees(Math.abs(routing.warehouseMargin))}</p>
                </div>
              )}
            </div>
            {routing.localMargin !== undefined && routing.warehouseMargin !== undefined && (
              <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-success/10 py-2">
                <span className="size-1.5 rounded-full bg-success" />
                <p className="text-sm font-semibold text-success">
                  Local routing saves {formatRupees(routing.localMargin - routing.warehouseMargin)} vs warehouse
                </p>
              </div>
            )}
          </Card>
        )}
      </div>
  );
}
