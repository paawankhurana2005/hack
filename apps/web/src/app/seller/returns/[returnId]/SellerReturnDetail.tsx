'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getReturnById,
  approveReturn,
  completeDeal,
  type SubmittedReturn,
} from '@/lib/mocks/return-store';
import { createLocalRoutingListing, RESCUE_WINDOW_HOURS } from '@/lib/mocks/exchange-store';
import { upsertReturnRecord, initiateMatching, ApiRequestError } from '@/lib/api-client';
import { earnSeller } from '@/lib/credits-store';
import { currentAccountId } from '@/lib/storage';
import { Card } from '@/components/ui/card';

interface Props {
  returnId: string;
}

const GRADE_STYLE: Record<string, string> = {
  A: 'bg-success/20 text-success border-success/30',
  B: 'bg-warning/20 text-warning border-warning/30',
  C: 'bg-brand/20 text-brand border-brand/30',
  Salvage: 'bg-danger/20 text-danger border-danger/30',
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

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const label = value >= 0.8 ? 'High' : value >= 0.6 ? 'Medium' : 'Low';
  const color = value >= 0.8 ? 'bg-success' : value >= 0.6 ? 'bg-warning' : 'bg-danger';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>AI Confidence</span>
        <span className="font-semibold">{label} ({pct}%)</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HealthCardOverlay({
  ret,
  onClose,
}: {
  ret: SubmittedReturn;
  onClose: () => void;
}) {
  const grading = ret.gradingResult;
  const gradeCls = grading?.grade ? GRADE_STYLE[grading.grade] : 'bg-secondary text-muted-foreground border-border';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Translucent backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
              Product Health Card
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{ret.productName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {grading ? (
          <div className="space-y-4">
            {/* Health Card narrative — the trust layer, minted at the return click */}
            {ret.healthCard && (
              <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
                {'fallback' in ret.healthCard ? (
                  <p className="text-sm text-muted-foreground">{ret.healthCard.summary}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-foreground">{ret.healthCard.summary}</p>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-secondary">
                        <div
                          className="h-1.5 rounded-full bg-success"
                          style={{ width: `${ret.healthCard.trustScore}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-success">
                        {ret.healthCard.trustScore}/100 trust
                      </span>
                    </div>
                    {ret.healthCard.notVerified.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Not verified from photos: {ret.healthCard.notVerified.join('; ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Grade */}
            <div className="space-y-3">
              {grading.grade && (
                <div className="flex items-center gap-3">
                  <span className={`rounded-xl border px-4 py-2 text-base font-bold tracking-wide ${gradeCls}`}>
                    Grade {grading.grade}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {grading.grade === 'A'
                      ? 'Excellent condition — minimal wear, sale-ready.'
                      : grading.grade === 'B'
                      ? 'Good condition — minor cosmetic wear, functional.'
                      : grading.grade === 'C'
                      ? 'Fair condition — visible wear, may need attention.'
                      : 'Salvage — not suitable for resale.'}
                  </p>
                </div>
              )}
              <ConfidenceBar value={grading.confidence} />
            </div>

            {/* Authenticity */}
            <div className={`flex items-center gap-2 rounded-lg border p-3 ${
              grading.authenticityMatch
                ? 'border-success/30 bg-success/10'
                : 'border-warning/30 bg-warning/10'
            }`}>
              <span className={grading.authenticityMatch ? 'text-success' : 'text-warning'}>
                {grading.authenticityMatch ? '✓' : '⚠'}
              </span>
              <p className="text-sm">
                {grading.authenticityMatch
                  ? 'Authenticity verified — matches product records'
                  : 'Authenticity mismatch — label inconsistency detected'}
              </p>
            </div>

            {/* Defects */}
            {grading.defects.length > 0 && (
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Detected issues
                </p>
                <ul className="space-y-1.5">
                  {grading.defects.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 text-warning">•</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {grading.defects.length === 0 && (
              <p className="text-sm text-success">No defects detected.</p>
            )}

            {/* Functional check */}
            <div className="rounded-lg border border-border bg-secondary/60 p-3">
              <p className="text-xs text-muted-foreground">
                Functional state:{' '}
                <span className={grading.functionallyVerifiable ? 'text-success' : 'text-warning'}>
                  {grading.functionallyVerifiable
                    ? 'Verified from photos'
                    : 'Cannot verify from photos — will be tested in person'}
                </span>
              </p>
            </div>

            {/* Wardrobe flag */}
            {grading.wardrobingFlag && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm text-warning">
                  Wardrobe return flag: evidence of extended use detected.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              This card travels with the item to its next owner.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No photos submitted — item will be graded in person at pickup.
          </p>
        )}
      </div>
    </div>
  );
}

export function SellerReturnDetail({ returnId }: Props) {
  const [ret, setRet] = useState<SubmittedReturn | null | 'loading'>('loading');
  const [showHealthCard, setShowHealthCard] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [matchInfo, setMatchInfo] = useState<{ candidateCount: number; sessionId: string } | null>(null);
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

    if (!currentGrading?.grade || currentGrading.grade === 'Salvage' || currentRouting?.decision !== 'local_resale') {
      setApproveError('This return is missing the grading data needed to start local matching.');
      return;
    }

    setApproving(true);
    setApproveError(null);
    setMatchInfo(null);

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
    if (!ret || ret === 'loading') return;
    setRet({ ...ret, status: 'in_transit' });
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
    <>
      {showHealthCard && (
        <HealthCardOverlay ret={ret} onClose={() => setShowHealthCard(false)} />
      )}

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
            <div className="flex overflow-hidden rounded-2xl border border-border bg-card">
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
                  <p className="mt-1 text-2xl font-bold text-success">+{formatPrice(routing.localMargin)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Seller approval CTA (Grade A / local_resale) ── */}
        {isPendingApproval && routing?.decision === 'local_resale' && (
          <div className="rounded-2xl border-2 border-warning/40 bg-warning/5 p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl">⚡</span>
              <div className="flex-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-warning">
                  Action required
                </p>
                <p className="mt-1 text-xl font-bold text-foreground">
                  Approve for local listing
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This item has been AI-graded as{' '}
                  <span className="font-semibold text-foreground">Grade {grading?.grade}</span>.
                  Approving creates a local listing — the rescue pipeline will handle pricing and buyer matching. No warehouse trip needed.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  {routing.localMargin !== undefined && (
                    <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-center">
                      <p className="text-xs text-muted-foreground">Est. value recovered</p>
                      <p className="mt-1 text-lg font-bold text-success">+{formatPrice(routing.localMargin)}</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
                    <p className="text-xs text-muted-foreground">CO₂ avoided</p>
                    <p className="mt-1 text-lg font-bold text-foreground">{routing.co2SavedKg} kg</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={approving}
                    onClick={() => void handleApprove()}
                    className="flex-1 rounded-xl bg-success px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:flex-none"
                  >
                    {approving ? 'Starting local matching…' : 'Approve for Local Listing'}
                  </button>
                  <button
                    type="button"
                    disabled={approving}
                    onClick={handleSendToWarehouse}
                    className="flex-1 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60 sm:flex-none"
                  >
                    Send to Warehouse Instead
                  </button>
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
              </div>
            </div>
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

        {/* ── AI Grading ── */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              AI Grading — doorstep assessment
            </p>
            <button
              type="button"
              onClick={() => setShowHealthCard(true)}
              className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/10"
            >
              View Condition Report Card →
            </button>
          </div>

          {grading ? (
            <div className="space-y-4">
              {/* Grade pill + authenticity inline */}
              <div className="flex flex-wrap items-center gap-3">
                {grading.grade && (
                  <span className={`rounded-xl border px-4 py-2 text-sm font-bold tracking-wide ${gradeCls}`}>
                    Grade {grading.grade}
                  </span>
                )}
                {grading.authenticityMatch ? (
                  <span className="text-sm text-success">✓ Authenticity verified</span>
                ) : (
                  <span className="text-sm text-warning">⚠ Authenticity mismatch detected</span>
                )}
              </div>

              <ConfidenceBar value={grading.confidence} />

              {grading.defects.length > 0 && (
                <ul className="space-y-1">
                  {grading.defects.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 text-warning">•</span>
                      {d}
                    </li>
                  ))}
                </ul>
              )}

              {grading.wardrobingFlag && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <p className="text-sm text-warning">Wardrobe return flag: evidence of extended use detected.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-secondary p-4">
              <p className="text-sm text-muted-foreground">
                No photos submitted — item will be graded in person at pickup.
              </p>
            </div>
          )}
        </Card>

        {/* ── Intelligent Bridge — glass-box EV breakdown ── */}
        {routing?.evBreakdown && (
          <Card>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Intelligent Bridge — why {routing.decision.replace(/_/g, ' ')}
            </p>
            <p className="mb-4 text-sm text-muted-foreground">{routing.reasoning}</p>
            <div className="space-y-2">
              {[...routing.evBreakdown.paths]
                .sort((a, b) => b.evCents - a.evCents)
                .map((p) => {
                  const isChosen = p.path === routing.evBreakdown!.chosen;
                  return (
                    <div key={p.path} className="space-y-1">
                      <div
                        className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                          isChosen ? 'bg-brand/10 ring-1 ring-brand/40' : 'bg-secondary/50'
                        } ${p.viable ? '' : 'opacity-60'}`}
                      >
                        <span className="text-sm capitalize text-foreground">
                          {isChosen && '✓ '}
                          {p.path.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`font-mono text-sm tabular-nums ${
                            p.evCents >= 0 ? 'text-foreground' : 'text-danger'
                          }`}
                        >
                          {p.evCents >= 0 ? '+' : '−'}
                          {formatPrice(Math.abs(p.evCents))}
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
                  <p className="mt-1 text-2xl font-bold text-success">+{formatPrice(routing.localMargin)}</p>
                </div>
              )}
              {routing.warehouseMargin !== undefined && (
                <div className="rounded-xl bg-danger/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground">Warehouse route net</p>
                  <p className="mt-1 text-2xl font-bold text-danger">−{formatPrice(Math.abs(routing.warehouseMargin))}</p>
                </div>
              )}
            </div>
            {routing.localMargin !== undefined && routing.warehouseMargin !== undefined && (
              <p className="mt-3 text-center text-sm font-semibold text-success">
                Local routing saves {formatPrice(routing.localMargin - routing.warehouseMargin)} vs warehouse
              </p>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
