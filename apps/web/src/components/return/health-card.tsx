'use client';

import { useState } from 'react';
import type { ReturnGradingResult, ReturnHealthCard, ReturnItemState, ReturnStateTransition } from '@reloop/shared';
import { DEMO_CONDITION_SCORE, conditionScoreColor } from '@/lib/demo-grading';

// Same visual chrome as the Sell flow's showpiece card
// (apps/web/src/components/sell/health-card.tsx) — rotated shadow card, VFD
// authenticity stamp, timeline, stamped footer — applied to the Return
// flow's actual data instead of duplicating a thinner bespoke card per call
// site (previously: an inline modal in SellerReturnDetail.tsx and a separate
// inline card in BuyerStep2Pickup.tsx). No share-link affordance here:
// unlike the Sell flow's ProductHealthCard, ReturnHealthCard has no public
// healthCardUrl — the item isn't listed anywhere yet at this stage.

type HealthCardResult = ReturnHealthCard | { fallback: true; summary: string };

const GRADE_STYLE: Record<string, string> = {
  A: 'bg-success/20 text-success border-success/30',
  B: 'bg-warning/20 text-warning border-warning/30',
  C: 'bg-brand/20 text-brand border-brand/30',
  Salvage: 'bg-danger/20 text-danger border-danger/30',
};

// Human labels for the return lifecycle state machine (spec 016). Only the
// states a return can plausibly reach by the time this card is shown are
// labeled with return-specific language; the rest fall back to a generic
// title-case of the state name.
const STATE_LABEL: Partial<Record<ReturnItemState, string>> = {
  initiated: 'Return initiated',
  evidence_captured: 'Photos captured',
  routed: 'Routed by the Intelligent Bridge',
  seller_route_choice: 'Seller chose a different route',
  pickup_verified: 'Verified at pickup',
  at_local_hub: 'Arrived at local hub',
  hub_verified: 'Grade confirmed at hub bench',
  listed_local: 'Listed for local resale',
  sold: 'Sold to a local buyer',
  delivered_to_buyer: 'Delivered to buyer',
  refurb_queue: 'Queued for refurbishment',
  restock_outbound: 'Sent for restock',
  restocked: 'Restocked',
  pallet_staging: 'Staged into a liquidation pallet',
  liquidated: 'Liquidated',
  donation_batch: 'Queued for donation',
  donated: 'Donated',
  recycle_batch: 'Queued for recycling',
  recycled: 'Recycled',
  rl_outbound: 'Sent to standard reverse logistics',
  returnless_closed: 'Refund issued — item stays with you',
};

function stateLabel(state: ReturnItemState): string {
  return STATE_LABEL[state] ?? state.replace(/_/g, ' ');
}

// DEMO: a fixed condition blurb for the seller's Health Card. The pitch demos a
// shoe return, so the copy is written for one. Replace with the grader's own
// `summary` (ReturnGradingResult.summary) once every return populates it.
const DEMO_CONDITION_SUMMARY =
  'The shoes look in perfect condition. No creases found on any part of the shoe.';

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// The trained grader's raw continuous condition score, alongside AI Confidence.
function ScoreBar({ value }: { value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>Condition score</span>
        <span className="font-mono font-semibold text-foreground">{value.toFixed(3)} / 1.00</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary">
        <div
          className={`h-2 rounded-full ${conditionScoreColor(value)} transition-all`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
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

export function ReturnHealthCardDeep({
  productName,
  returnId,
  grading,
  healthCard,
  transitions,
  submittedAt,
}: {
  productName: string;
  returnId: string;
  grading: ReturnGradingResult | null;
  healthCard?: HealthCardResult;
  transitions?: ReturnStateTransition[];
  submittedAt: string;
}) {
  const [copied, setCopied] = useState(false);
  const gradeCls = grading?.grade ? GRADE_STYLE[grading.grade] : 'bg-secondary text-muted-foreground border-border';
  const cardFallback = healthCard && 'fallback' in healthCard;

  async function copyReturnId() {
    try {
      await navigator.clipboard.writeText(returnId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  // A transition's `to` state is the meaningful event; `from` is implied by
  // the previous entry. Fall back to a single "submitted" entry when nothing
  // has transitioned yet (shouldn't happen in practice — the return flow
  // seeds evidence_captured/routed transitions at submission time — but this
  // keeps the timeline honest rather than empty if it ever does).
  const timeline =
    transitions && transitions.length > 0
      ? transitions.map((t) => ({ label: stateLabel(t.to), at: t.at }))
      : [{ label: 'Return submitted', at: submittedAt }];

  return (
    <div className="relative">
      <div className="absolute -inset-8 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative rotate-[-1deg] rounded-[28px] bg-background p-1 shadow-2xl shadow-black/50 ring-1 ring-border transition-transform duration-500 hover:rotate-0">
        <div className="rounded-[24px] bg-card p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Product Health Card
              </div>
              <div className="mt-1 font-mono text-sm tracking-tight text-foreground">{returnId}</div>
            </div>
            {grading?.authenticityMatch && (
              <div className="grid size-12 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-[10px] font-semibold text-brand">
                VFD
              </div>
            )}
          </div>

          <h3 className="mt-4 text-xl font-semibold tracking-tight text-foreground">{productName}</h3>

          {grading ? (
            <>
              {/* Verdict */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {grading.grade && (
                  <span className={`rounded-xl border px-3 py-1 text-sm font-bold tracking-wide ${gradeCls}`}>
                    Grade {grading.grade}
                  </span>
                )}
                {grading.authenticityMatch ? (
                  <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    ✓ Authenticity verified
                  </span>
                ) : (
                  <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
                    ⚠ Authenticity mismatch
                  </span>
                )}
              </div>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {DEMO_CONDITION_SUMMARY}
              </p>

              {/* DEMO: the score is read from the constant, not from
                  `grading.conditionScore`, so it reads 0.964 even on records
                  graded before the pin (or by the VLM fallback, which emits
                  no score at all). */}
              <div className="mt-4 space-y-4">
                <ScoreBar value={DEMO_CONDITION_SCORE} />
                <ConfidenceBar value={grading.confidence} />
              </div>

              {/* Health Card narrative — the trust layer */}
              {healthCard && (
                <div className="mt-4 rounded-lg border border-brand/30 bg-brand/5 p-3">
                  {cardFallback ? (
                    <p className="text-sm text-muted-foreground">{healthCard.summary}</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-foreground">{(healthCard as ReturnHealthCard).summary}</p>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-secondary">
                          <div
                            className="h-1.5 rounded-full bg-success"
                            style={{ width: `${(healthCard as ReturnHealthCard).trustScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-success">
                          {(healthCard as ReturnHealthCard).trustScore}/100 trust
                        </span>
                      </div>
                      {(healthCard as ReturnHealthCard).verifiedAttributes.length > 0 && (
                        <ul className="space-y-1">
                          {(healthCard as ReturnHealthCard).verifiedAttributes.map((a) => (
                            <li key={a} className="flex items-start gap-2 text-sm text-success">
                              <span className="mt-0.5">✓</span>{a}
                            </li>
                          ))}
                        </ul>
                      )}
                      {(healthCard as ReturnHealthCard).notVerified.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Not verified from photos: {(healthCard as ReturnHealthCard).notVerified.join('; ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Detected issues (honest) */}
              {grading.defects.length > 0 ? (
                <div className="mt-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Condition notes
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {grading.defects.map((d) => (
                      <li key={d} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 text-sm text-success">No defects detected.</p>
              )}

              {/* Functional check */}
              <div className="mt-4 rounded-lg border border-border bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">
                  Functional state:{' '}
                  <span className={grading.functionallyVerifiable ? 'text-success' : 'text-warning'}>
                    {grading.functionallyVerifiable
                      ? 'Verified from photos'
                      : 'Cannot verify from photos — will be tested in person'}
                  </span>
                </p>
              </div>

              {grading.wardrobingFlag && (
                <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <p className="text-sm text-warning">
                    Wardrobe return flag: evidence of extended use detected.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No photos submitted — item will be graded in person at pickup.
            </p>
          )}

          {/* Timeline — this item's real lifecycle, not a placeholder */}
          <div className="mt-5 rounded-xl bg-surface p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-brand">History</p>
            <ol className="relative space-y-3 pl-4">
              <span className="absolute bottom-1 left-[5px] top-1 w-px bg-border" />
              {timeline.map((e, i) => (
                <li key={`${e.label}-${i}`} className="relative flex items-center justify-between text-sm">
                  <span className="flex items-center gap-3 text-foreground">
                    <span className="absolute -left-4 size-2 rounded-full bg-brand ring-2 ring-card" />
                    {e.label}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{when(e.at)}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Stamped footer */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-widest text-muted-foreground">
              Stamped {when(submittedAt)}
              <br />
            </p>
            <button
              type="button"
              onClick={() => void copyReturnId()}
              className="rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-brand hover:text-brand"
            >
              {copied ? 'Copied ✓' : 'Copy return ID'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
