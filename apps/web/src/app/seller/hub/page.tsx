'use client';

// Spec 016 — the local hub bench: the delivery-station checkpoint where a human
// confirms (or overrides) the doorstep AI grade and the SAME deterministic engine
// re-runs with the updated evidence. This is the last cheap redirect before an
// item commits to its route — wrong AI grades are caught HERE, before any buyer
// is exposed, and the correction costs a shelf move instead of a lost item.

import { useEffect, useMemo, useState } from 'react';
import {
  decideRoute,
  PALLET_CAPACITY,
  posteriorFromPointGrade,
  tagDefects,
  type Grade,
  type ReturnItemState,
  type ReturnRoutingDecision,
  type ReturnStateTransition,
  type RoutingEvProfile,
} from '@reloop/shared';
import Link from 'next/link';
import {
  getSubmittedReturns,
  lifecycleOf,
  linkLot,
  recordTransition,
  type SubmittedReturn,
} from '@/lib/mocks/return-store';
import { getBatches, stageReturnIntoLot, type BulkBatch } from '@/lib/mocks/bulk-exchange-store';
import { birthAgentFromReturn, categoryOf, LIST_FRAC, round50 } from '@/lib/return-agent-bridge';
import { Card } from '@/components/ui/card';

const GRADES: Grade[] = ['A', 'B', 'C', 'Salvage'];

// Lower rank = better condition — used to tell "bench upgraded" from
// "bench downgraded" apart when the verified grade differs from the AI's.
const GRADE_RANK: Record<Grade, number> = { A: 0, B: 1, C: 2, Salvage: 3 };

// Same convention as SellerReturnDetail.tsx's GRADE_STYLE — color-coded so a
// grade reads at a glance instead of as plain gray text.
const GRADE_STYLE: Record<string, string> = {
  A: 'bg-success/20 text-success ring-success/30',
  B: 'bg-warning/20 text-warning ring-warning/30',
  C: 'bg-brand/20 text-brand ring-brand/30',
  Salvage: 'bg-danger/20 text-danger ring-danger/30',
};

const STATE_LABEL: Partial<Record<ReturnItemState, string>> = {
  initiated: 'Initiated',
  evidence_captured: 'Evidence captured',
  routed: 'Routed (provisional)',
  pickup_verified: 'Driver verified',
  at_local_hub: 'At hub bench',
  hub_verified: 'Bench verified',
  listed_local: 'Listed locally',
  restock_outbound: 'Restock outbound',
  refurb_queue: 'Refurb queue',
  donation_batch: 'Donation batch',
  recycle_batch: 'Recycle batch',
  pallet_staging: 'Pallet staging',
  liquidated: 'Liquidated (pallet sold)',
  returnless_closed: 'Returnless — refund issued',
  rl_outbound: 'Standard RL outbound',
};

// Where a confirmed decision physically sends the item.
const EXEC_STATE: Record<ReturnRoutingDecision['decision'], ReturnItemState> = {
  restock: 'restock_outbound',
  local_resale: 'listed_local',
  refurbish: 'refurb_queue',
  liquidate: 'pallet_staging',
  donate: 'donation_batch',
  recycle: 'recycle_batch',
  warehouse: 'rl_outbound',
  return_to_seller: 'rl_outbound',
  returnless_refund: 'returnless_closed', // unreachable at the hub (item never moves)
};

const PATH_LABEL: Record<ReturnRoutingDecision['decision'], string> = {
  restock: 'Restock as sellable',
  local_resale: 'Resell locally',
  refurbish: 'Refurbish',
  liquidate: 'Liquidate (hub pallet)',
  donate: 'Donate',
  recycle: 'Recycle',
  warehouse: 'Warehouse',
  return_to_seller: 'Return to seller',
  returnless_refund: 'Returnless refund',
};

const CHECKPOINT_FLOW: ReturnItemState[] = ['routed', 'pickup_verified', 'at_local_hub', 'hub_verified'];

/** A real connected-circle stepper instead of a row of plain text pills —
 *  checkmark for done, filled+pulsing for current, outlined for pending. */
function LifecycleStepper({ state }: { state: ReturnItemState }) {
  const idx = CHECKPOINT_FLOW.indexOf(state);
  const terminal = idx === -1; // dispatched past the checkpoint flow entirely
  const steps = terminal ? [...CHECKPOINT_FLOW, state] : CHECKPOINT_FLOW;

  return (
    <div className="flex items-start">
      {steps.map((s, i) => {
        const isFinalTerminalStep = terminal && i === steps.length - 1;
        const done = isFinalTerminalStep || (!terminal && idx > i);
        const current = !terminal && idx === i;
        return (
          <div key={s} className={`flex items-center ${i === steps.length - 1 ? '' : 'flex-1'}`}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ring-2 transition-colors ${
                  done
                    ? 'bg-success text-white ring-success'
                    : current
                      ? 'animate-pulse bg-brand text-brand-foreground ring-brand'
                      : 'bg-secondary text-muted-foreground ring-border'
                }`}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                className={`whitespace-nowrap font-mono text-[9px] uppercase tracking-widest ${
                  current ? 'text-brand' : done ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                {STATE_LABEL[s] ?? s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-1.5 mb-4 h-0.5 flex-1 rounded-full ${done ? 'bg-success' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function inr(paise: number) {
  return `₹${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;
}

/**
 * Spec 016 Stage 7 — the hub dispatch births the autonomous executor: a real
 * marketplace listing plus a Listing Agent instance. Spec 026: this is now a
 * thin wrapper over the shared birthAgentFromReturn() helper, so the direct
 * seller-returns approval flow can birth an equivalent listing too.
 */
async function birthReturnListing(
  ret: SubmittedReturn,
  benchGrade: Grade,
  benchResult: ReturnType<typeof decideRoute>,
  packagingSealed: boolean,
  sellerApprovedPriceCents?: number,
): Promise<string> {
  const driverScan = ret.transitions?.find((t) => t.to === 'pickup_verified');
  return birthAgentFromReturn({
    ret,
    grade: benchGrade,
    evByPath: benchResult.evByPath,
    packagingSealed,
    radiusKm: benchResult.radiusKm ?? 4,
    sellerApprovedPriceCents,
    driverScanAt: driverScan?.at,
  });
}

export default function HubBenchPage() {
  const [returns, setReturns] = useState<SubmittedReturn[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Spec 016.1: open hub pallets (one per category) filling from liquidate-routed items.
  const [stagingLots, setStagingLots] = useState<BulkBatch[]>([]);

  // Bench form state
  const [benchGrade, setBenchGrade] = useState<Grade>('A');
  const [sealIntact, setSealIntact] = useState(false);
  const [functionalPass, setFunctionalPass] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  // Spec 023: seller's own price call for a "slightly damaged but resellable"
  // item — seeds the listing's price/floor at birth instead of the engine's
  // grade-based default. Empty = use the engine's suggested price.
  const [approvedPriceInput, setApprovedPriceInput] = useState('');
  // Spec 026: reopening an already-dispatched item shows the exact same
  // Checkpoint-2 UI again (benchResult is already computed regardless of
  // lifecycle state) instead of leaving the terminal recap card read-only.
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const all = getSubmittedReturns().filter((r) => r.routingDecision !== null);
    setReturns(all);
    if (all.length > 0) setSelectedId(all[0]!.returnId);
    setStagingLots(getBatches().filter((b) => b.status === 'staging'));
  }, []);

  const selected = returns.find((r) => r.returnId === selectedId) ?? null;
  const state: ReturnItemState = selected ? lifecycleOf(selected) : 'initiated';

  // Sync the bench form to the selected item's AI verdict.
  useEffect(() => {
    if (!selected) return;
    const g = selected.gradingResult?.grade;
    setBenchGrade(g && g !== null ? g : 'B');
    setSealIntact(selected.gradingResult?.packagingSealed ?? false);
    setFunctionalPass(selected.gradingResult?.functionallyVerifiable ?? true);
    setApprovedPriceInput('');
    setReopened(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Live engine re-run with the bench evidence — the glass-box preview the
  // operator sees BEFORE confirming. A human held the item, so confidence ≈ 0.98.
  const benchResult = useMemo(() => {
    if (!selected?.routingDecision) return null;
    const d = selected.routingDecision;
    const clearingPriceCents = Math.round(selected.priceCents * 0.6);
    const profile: RoutingEvProfile = {
      grade: benchGrade,
      reason: selected.reason,
      sellerType: d.sellerType,
      sellerOptedIn: d.sellerType === '1P',
      authenticityMatch: selected.gradingResult?.authenticityMatch ?? true,
      functionallyVerifiable: functionalPass,
      clearingPriceCents,
      localHandlingCents: Math.round(clearingPriceCents * 0.15),
      nearbyBuyers: d.nearbyBuyers ?? 5,
      radiusKm: d.radiusKm ?? 4,
      warehouseDistanceKm: d.warehouseDistanceKm ?? 580,
      confidence: 0.98,
      gradePosterior: posteriorFromPointGrade(benchGrade, 0.98),
      category: categoryOf(selected),
      sealed: sealIntact,
      skuActive: true,
      nearestFcKm: 45,
      // Spec 016.1: bench-verified Health Card ⇒ full manifest; defect tags feed
      // the defect-level refurb table; wardrobing blocks returnless.
      defectTags: tagDefects(selected.gradingResult?.defects ?? []),
      manifestCoverage: 1,
      fraudSignal: selected.gradingResult?.wardrobingFlag ?? false,
    };
    return decideRoute(profile);
  }, [selected, benchGrade, sealIntact, functionalPass]);

  function refresh() {
    setReturns(getSubmittedReturns().filter((r) => r.routingDecision !== null));
    setStagingLots(getBatches().filter((b) => b.status === 'staging'));
  }

  function transition(to: ReturnItemState, extra?: Partial<ReturnStateTransition>) {
    if (!selected) return;
    recordTransition(selected.returnId, {
      from: state,
      to,
      at: new Date().toISOString(),
      ...extra,
    });
    refresh();
  }

  function handleDriverScan() {
    transition('pickup_verified', {
      evidence: { source: 'driver', matchesPhotos: true, packagingSealed: sealIntact },
    });
  }

  // Spec 026: reopen an already-dispatched item — seed the bench form from
  // the LAST recorded verification (not the original AI grade) so the seller
  // starts from where things actually stand, then let them recalculate.
  function handleReopen() {
    if (!selected) return;
    const lastDecisionTransition = [...(selected.transitions ?? [])].reverse().find((t) => t.decision);
    const lastEvidence = lastDecisionTransition?.evidence;
    const lastGrade = lastEvidence?.observedGrade ?? selected.gradingResult?.grade;
    setBenchGrade(lastGrade && lastGrade !== null ? lastGrade : 'B');
    setSealIntact(lastEvidence?.packagingSealed ?? selected.gradingResult?.packagingSealed ?? false);
    setFunctionalPass(lastEvidence?.functionalCheckPassed ?? selected.gradingResult?.functionallyVerifiable ?? true);
    setApprovedPriceInput('');
    setReopened(true);
  }

  async function handleConfirmDispatch() {
    if (!selected?.routingDecision || !benchResult) return;
    setDispatching(true);
    const aiGrade = selected.gradingResult?.grade ?? null;
    const overrode = aiGrade !== benchGrade;
    const decision: ReturnRoutingDecision = {
      decision: benchResult.decision,
      reasoning: `Hub bench ${overrode ? `overrode grade ${aiGrade ?? '?'} → ${benchGrade}` : `confirmed grade ${benchGrade}`}${
        sealIntact ? ', seal intact' : ', seal broken'
      }. Engine re-ran with human-verified evidence and routed to ${PATH_LABEL[benchResult.decision]}.`,
      co2SavedKg: benchResult.co2SavedKg,
      dwellBudgetHours: benchResult.dwellBudgetHours,
      ttlHours: benchResult.ttlHours,
      sellerType: selected.routingDecision.sellerType,
      fallbackChain: benchResult.fallbackChain,
      evBreakdown: {
        hardRule: benchResult.hardRule,
        chosen: benchResult.decision,
        paths: benchResult.evByPath,
      },
      localMargin: Math.round(benchResult.localMarginCents / 100),
      warehouseMargin: Math.round(benchResult.warehouseMarginCents / 100),
      warehouseDistanceKm: benchResult.warehouseDistanceKm,
      nearbyBuyers: benchResult.nearbyBuyers,
      radiusKm: benchResult.radiusKm,
    };
    // Spec 026: a reopened re-decision uses 'seller_route_choice' — the same
    // lifecycle state the returns-page seller override reuses — instead of
    // 'hub_verified' again, so the transition log honestly distinguishes "the
    // original bench verification" from "the seller reconsidered later."
    // Either way, `from` is the item's REAL current state, not a hardcoded
    // assumption that this is always the first pass through Checkpoint 2.
    const verificationState: ReturnItemState = reopened ? 'seller_route_choice' : 'hub_verified';
    recordTransition(selected.returnId, {
      from: state,
      to: verificationState,
      at: new Date().toISOString(),
      evidence: {
        source: 'hub_bench',
        observedGrade: benchGrade,
        confidence: 0.98,
        packagingSealed: sealIntact,
        functionalCheckPassed: functionalPass,
      },
      decision,
    });
    recordTransition(selected.returnId, {
      from: verificationState,
      to: EXEC_STATE[benchResult.decision],
      at: new Date().toISOString(),
    });
    // Spec 016 Stage 7: local resale doesn't end at "dispatched" — an autonomous
    // agent takes over the listing (reprice via spec-014, escalate via the Bridge).
    // Spec 026: skip if a real listing already exists (a reopened re-decision
    // that confirms/re-picks local_resale shouldn't spawn a second one).
    if (benchResult.decision === 'local_resale' && !selected.listingId) {
      const approvedRupees = Number(approvedPriceInput);
      const sellerApprovedPriceCents =
        Number.isFinite(approvedRupees) && approvedRupees > 0
          ? Math.round(approvedRupees * 100)
          : undefined;
      await birthReturnListing(selected, benchGrade, benchResult, sealIntact, sellerApprovedPriceCents);
    }
    // Spec 016.1: liquidate-bound items join the open hub pallet for their
    // category — the lot engine re-prices the pallet and re-runs ship-vs-wait
    // on every unit added. Spec 026: same duplicate guard as above.
    if (benchResult.decision === 'liquidate' && !selected.lotId) {
      const lot = stageReturnIntoLot(
        { returnId: selected.returnId, category: selected.category, priceCents: selected.priceCents },
        benchGrade,
      );
      linkLot(selected.returnId, lot.id);
    }
    setDispatching(false);
    setReopened(false);
    refresh();
  }

  const rerouted =
    benchResult && selected?.routingDecision && benchResult.decision !== selected.routingDecision.decision;

  return (
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Hub Bench
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Local hub bench</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        The delivery-station checkpoint. Items already pass through here — we stop them, confirm the
        doorstep AI grade in ~10 minutes, repackage, and the engine re-routes while a redirect still
        costs a shelf move. Wrong grades are caught before any buyer sees the item.
      </p>

      {/* Spec 016.1: pallet staging — the manifested lots filling at this hub */}
      {stagingLots.length > 0 && (
        <div className="mt-6 space-y-2">
          {stagingLots.map((lot) => {
            const fill = Math.min(1, lot.units / PALLET_CAPACITY);
            return (
              <Card key={lot.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Pallet staging — {lot.category}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {lot.id} · Health-Card manifested ·{' '}
                      {lot.units}/{PALLET_CAPACITY} units
                    </p>
                  </div>
                  {lot.primaryMatch && (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {lot.primaryMatch.buyerName}{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({lot.primaryMatch.buyerType})
                        </span>
                      </p>
                      <p className="text-xs text-success">
                        Current bid ₹{lot.primaryMatch.sellerEarnings.toLocaleString('en-IN')} to
                        the seller
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-warning" style={{ width: `${fill * 100}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{lot.remainingNote}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex gap-6">
        {/* Queue */}
        <div className="w-72 shrink-0 space-y-2">
          {returns.map((r) => {
            const st = lifecycleOf(r);
            return (
              <button
                key={r.returnId}
                type="button"
                onClick={() => setSelectedId(r.returnId)}
                className={`w-full rounded-xl p-3 text-left ring-1 transition-colors ${
                  r.returnId === selectedId
                    ? 'bg-secondary ring-brand/50'
                    : 'bg-card ring-border hover:bg-secondary/50'
                }`}
              >
                <p className="truncate text-sm font-semibold text-foreground">{r.productName}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {r.returnId}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand">
                    {STATE_LABEL[st] ?? st}
                  </span>
                  {r.gradingResult?.grade && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ring-1 ${
                        GRADE_STYLE[r.gradingResult.grade] ?? 'bg-secondary text-muted-foreground ring-border'
                      }`}
                    >
                      AI {r.gradingResult.grade} · {Math.round((r.gradingResult.confidence ?? 0) * 100)}%
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {returns.length === 0 && (
            <Card>
              <p className="text-sm text-muted-foreground">
                No routed returns in the queue yet — submit a return from the user app first.
              </p>
            </Card>
          )}
        </div>

        {/* Bench */}
        {selected && selected.routingDecision && (
          <div className="min-w-0 flex-1 space-y-4">
            {/* Lifecycle strip */}
            <Card>
              <LifecycleStepper state={state} />
              {selected.routingDecision.ttlHours !== undefined && CHECKPOINT_FLOW.includes(state) && (
                <p className="mt-3 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Decision TTL {selected.routingDecision.ttlHours}h
                </p>
              )}
            </Card>

            {/* Current decision */}
            <Card>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Current route · decided {CHECKPOINT_FLOW.includes(state) ? 'at the doorstep' : 'at this bench'}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {PATH_LABEL[selected.routingDecision.decision]}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{selected.routingDecision.reasoning}</p>
            </Card>

            {/* Stage action */}
            {state === 'routed' && (
              <Card>
                <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                  Checkpoint 1 · Driver scan (~30s at the doorstep)
                </p>
                <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={sealIntact}
                    onChange={(e) => setSealIntact(e.target.checked)}
                  />
                  Factory seal intact
                </label>
                <button
                  type="button"
                  onClick={handleDriverScan}
                  className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                >
                  Record driver scan
                </button>
              </Card>
            )}

            {state === 'pickup_verified' && (
              <Card>
                <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                  In the pickup van — items flow through the delivery station anyway
                </p>
                <button
                  type="button"
                  onClick={() => transition('at_local_hub')}
                  className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                >
                  Check in at hub bench
                </button>
              </Card>
            )}

            {(state === 'at_local_hub' || reopened) && benchResult && (
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                    Checkpoint 2 · Bench verification (last cheap redirect)
                  </p>
                  {reopened && (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-warning/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-warning">
                        Reopened — recalculating
                      </span>
                      <button
                        type="button"
                        onClick={() => setReopened(false)}
                        className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Verified grade (AI said {selected.gradingResult?.grade ?? '?'})
                    </p>
                    <div className="flex gap-1">
                      {GRADES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setBenchGrade(g)}
                          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition-colors ${
                            benchGrade === g
                              ? 'bg-brand/20 text-brand ring-brand/40'
                              : 'bg-secondary text-muted-foreground ring-border hover:text-foreground'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={sealIntact}
                      onChange={(e) => setSealIntact(e.target.checked)}
                    />
                    Seal intact
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={functionalPass}
                      onChange={(e) => setFunctionalPass(e.target.checked)}
                    />
                    Functional check passed
                  </label>
                </div>

                {/* AI vs bench comparison — the moment a wrong doorstep grade
                    gets caught, made impossible to miss. */}
                {(() => {
                  const aiGrade = selected.gradingResult?.grade ?? null;
                  const aiConfidencePct = Math.round((selected.gradingResult?.confidence ?? 0) * 100);
                  if (aiGrade === null || aiGrade === benchGrade) {
                    return (
                      <div className="mt-4 flex items-center gap-2 rounded-xl bg-success/10 p-3 ring-1 ring-success/30">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success text-xs text-white">
                          ✓
                        </span>
                        <p className="text-sm text-foreground">
                          {aiGrade === null ? (
                            <>
                              No doorstep AI grade to compare (ungraded at pickup) — bench verified{' '}
                              <span className="font-semibold">Grade {benchGrade}</span>.
                            </>
                          ) : (
                            <>
                              Bench confirms the AI's doorstep grade —{' '}
                              <span className="font-semibold">Grade {benchGrade}</span>.
                            </>
                          )}
                        </p>
                      </div>
                    );
                  }
                  const upgraded = GRADE_RANK[benchGrade] < GRADE_RANK[aiGrade];
                  return (
                    <div
                      className={`mt-4 flex flex-wrap items-center gap-3 rounded-xl p-4 ring-1 ${
                        upgraded ? 'bg-success/10 ring-success/30' : 'bg-warning/10 ring-warning/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg px-3 py-1.5 text-sm font-bold ring-1 ${GRADE_STYLE[aiGrade]}`}>
                          Grade {aiGrade}
                        </span>
                        <span className="text-xs text-muted-foreground">AI estimated ({aiConfidencePct}%)</span>
                      </div>
                      <span className="text-lg text-muted-foreground">→</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-lg px-3 py-1.5 text-sm font-bold ring-1 ${GRADE_STYLE[benchGrade]}`}
                        >
                          Grade {benchGrade}
                        </span>
                        <span className={`text-xs font-semibold ${upgraded ? 'text-success' : 'text-warning'}`}>
                          Bench {upgraded ? 'upgraded' : 'downgraded'} it
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {benchResult.decision === 'local_resale' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Approve a list price (₹, optional)
                    </span>
                    <input
                      type="number"
                      min={1}
                      inputMode="decimal"
                      value={approvedPriceInput}
                      onChange={(e) => setApprovedPriceInput(e.target.value)}
                      placeholder={`engine suggests ${Math.round(
                        round50(selected.priceCents * LIST_FRAC[benchGrade]) / 100,
                      )}`}
                      className="w-40 rounded-full bg-secondary px-3 py-1 text-sm text-foreground ring-1 ring-border focus:outline-none focus:ring-brand/50"
                    />
                    <span className="text-xs text-muted-foreground">
                      For a "slightly damaged but resellable" item — becomes the list price and floor.
                    </span>
                  </div>
                )}

                {/* Live re-evaluation preview — the single most important
                    sentence on this page, so it reads like one. */}
                <div
                  className={`mt-4 rounded-xl p-4 ring-2 ${
                    rerouted ? 'bg-warning/10 ring-warning/50' : 'bg-success/10 ring-success/40'
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Engine re-run with bench evidence
                  </p>
                  <p
                    className={`mt-1 flex items-center gap-2 text-lg font-bold ${
                      rerouted ? 'text-warning' : 'text-success'
                    }`}
                  >
                    <span>{rerouted ? '⚡' : '✓'}</span>
                    {rerouted
                      ? `Re-routes: ${PATH_LABEL[selected.routingDecision.decision]} → ${PATH_LABEL[benchResult.decision]}`
                      : `Confirms: ${PATH_LABEL[benchResult.decision]}`}
                  </p>
                  {benchResult.hardRule && (
                    <p className="mt-1 text-xs text-muted-foreground">Hard rule: {benchResult.hardRule}</p>
                  )}
                </div>

                <table className="mt-3 w-full text-left text-sm">
                  <tbody>
                    {benchResult.evByPath.map((p) => (
                      <tr key={p.path} className="border-t border-border">
                        <td className="py-1.5 pr-2 text-foreground">{PATH_LABEL[p.path]}</td>
                        <td className="py-1.5 pr-2 font-mono tabular-nums text-muted-foreground">
                          {p.evCents >= 0 ? '' : '−'}
                          {inr(p.evCents)}
                        </td>
                        <td className="py-1.5 font-mono text-[10px] uppercase tracking-widest">
                          {p.path === benchResult.decision ? (
                            <span className="text-success">chosen</span>
                          ) : p.viable ? (
                            <span className="text-muted-foreground">viable</span>
                          ) : (
                            <span className="text-danger">{p.gateReason ?? 'not viable'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  type="button"
                  disabled={dispatching}
                  onClick={() => void handleConfirmDispatch()}
                  className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {dispatching ? 'Dispatching…' : 'Confirm & dispatch'}
                </button>
              </Card>
            )}

            {!CHECKPOINT_FLOW.includes(state) && !reopened && (() => {
              // The most recent transition that carries a re-run decision —
              // this is the real recap of what actually happened, not just
              // which lifecycle bucket the item landed in.
              const lastDecisionTransition = [...(selected.transitions ?? [])].reverse().find((t) => t.decision);
              const finalDecision = lastDecisionTransition?.decision ?? selected.routingDecision!;
              const finalGrade = lastDecisionTransition?.evidence?.observedGrade ?? selected.gradingResult?.grade ?? null;
              const aiGrade = selected.gradingResult?.grade ?? null;
              const wasOverridden = finalGrade !== null && aiGrade !== null && finalGrade !== aiGrade;
              return (
                <div className="rounded-2xl bg-success/10 p-5 ring-1 ring-success/30">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-white">
                      ✓
                    </span>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-success">
                        Dispatched · {STATE_LABEL[state] ?? state}
                      </p>
                      <p className="text-lg font-bold text-foreground">{PATH_LABEL[finalDecision.decision]}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-success/20 pt-3">
                    {finalGrade && (
                      <span className={`rounded-lg px-3 py-1 text-sm font-bold ring-1 ${GRADE_STYLE[finalGrade]}`}>
                        Grade {finalGrade}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {wasOverridden
                        ? `Bench overrode the AI's Grade ${aiGrade} estimate`
                        : aiGrade === null
                          ? 'No doorstep AI grade to compare (ungraded at pickup)'
                          : "Confirmed the AI's doorstep grade"}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-muted-foreground">{finalDecision.reasoning}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {finalDecision.co2SavedKg !== undefined && <span>{finalDecision.co2SavedKg}kg CO₂ saved</span>}
                    {finalDecision.localMargin !== undefined && (
                      <span>
                        Net {finalDecision.localMargin >= 0 ? '+' : '−'}
                        {inr(Math.abs(finalDecision.localMargin) * 100)}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    {selected.listingId && (
                      <Link
                        href="/seller/local-listings"
                        className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                      >
                        Manage in Local Listings →
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={handleReopen}
                      className="rounded-full border border-success/40 px-4 py-2 text-sm font-semibold text-success hover:bg-success/10"
                    >
                      Reopen & recalculate
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Transition log */}
            {(selected.transitions?.length ?? 0) > 0 && (
              <Card>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Transition log
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {selected.transitions!.map((t, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(t.at).toLocaleTimeString('en-IN')}
                      </span>
                      <span>
                        {STATE_LABEL[t.from] ?? t.from} → {STATE_LABEL[t.to] ?? t.to}
                        {t.decision ? ` · re-routed to ${PATH_LABEL[t.decision.decision]}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
