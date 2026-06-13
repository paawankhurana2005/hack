'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getReturnById, type SubmittedReturn } from '@/lib/mocks/return-store';
import type { ReturnRoutingDecision } from '@reloop/shared';
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

const DECISION_STYLE: Record<
  ReturnRoutingDecision['decision'],
  { label: string; cls: string; icon: string }
> = {
  local_resale: { label: 'Local Buyer Match', cls: 'bg-success/20 text-success border-success/30', icon: '🏡' },
  refurbish: { label: 'Local Refurbishment', cls: 'bg-warning/20 text-warning border-warning/30', icon: '🔧' },
  donate: { label: 'Local Donation', cls: 'bg-secondary text-foreground border-border', icon: '🤝' },
  recycle: { label: 'Certified Recycling', cls: 'bg-brand/20 text-brand border-brand/30', icon: '♻️' },
  warehouse: { label: 'Warehouse Return', cls: 'bg-secondary text-muted-foreground border-border', icon: '📦' },
  return_to_seller: { label: 'Return to Seller', cls: 'bg-brand/20 text-brand border-brand/30', icon: '↩️' },
};

const STATUS_STYLE: Record<SubmittedReturn['status'], { label: string; cls: string }> = {
  awaiting_pickup: { label: 'Awaiting pickup', cls: 'bg-brand/15 text-brand' },
  in_transit: { label: 'In transit', cls: 'bg-warning/15 text-warning' },
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

export function SellerReturnDetail({ returnId }: Props) {
  const [ret, setRet] = useState<SubmittedReturn | null | 'loading'>('loading');

  useEffect(() => {
    setRet(getReturnById(returnId));
  }, [returnId]);

  if (ret === 'loading') {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 rounded-lg bg-secondary" />
        <div className="h-48 w-full rounded-2xl bg-secondary" />
        <div className="h-64 w-full rounded-2xl bg-secondary" />
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
  const decisionStyle = routing ? DECISION_STYLE[routing.decision] : null;
  const gradeCls = grading?.grade ? GRADE_STYLE[grading.grade] : 'bg-secondary text-muted-foreground border-border';
  const isLocal = routing && routing.decision !== 'warehouse' && routing.decision !== 'return_to_seller';
  const fallbackLabels = routing?.fallbackChain.map((d) => DECISION_STYLE[d]?.label ?? d) ?? [];
  const showHealthCard = routing?.decision === 'local_resale' || routing?.decision === 'refurbish';

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/seller/returns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand">
        ← Returns queue
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-brand">Return detail</span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{ret.productName}</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{ret.returnId}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Submitted {formatDateTime(ret.submittedAt)} · {ret.photoCount} photo{ret.photoCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${status.cls}`}>
            {status.label}
          </span>
          <span className="text-lg font-semibold text-brand">{formatPrice(ret.priceCents)}</span>
        </div>
      </div>

      {/* AI Grading */}
      <Card>
        <p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          AI Grading — doorstep assessment
        </p>

        {grading ? (
          <div className="space-y-5">
            {/* Grade + confidence */}
            <div className="flex items-start gap-4">
              {grading.grade && (
                <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border text-2xl font-bold ${gradeCls}`}>
                  {grading.grade}
                </div>
              )}
              <div className="flex-1 space-y-3">
                <ConfidenceBar value={grading.confidence} />
                <div className="flex items-center gap-2">
                  {grading.authenticityMatch ? (
                    <span className="text-sm text-success">✓ Authenticity verified — matches product records</span>
                  ) : (
                    <span className="text-sm text-warning">⚠ Authenticity mismatch detected</span>
                  )}
                </div>
              </div>
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

            {/* Functional check */}
            {!grading.functionallyVerifiable && (
              <div className="rounded-lg border border-border bg-secondary p-3">
                <p className="text-sm text-muted-foreground">
                  Functional condition not verifiable from photos — will be tested in person before any resale.
                </p>
              </div>
            )}

            {/* Wardrobe flag */}
            {grading.wardrobingFlag && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm text-warning">
                  Wardrobe return flag: evidence of extended use detected.
                </p>
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

      {/* Intelligent Bridge */}
      <Card>
        <p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Intelligent Bridge — routing decision
        </p>

        {routing && decisionStyle ? (
          <div className="space-y-5">
            {/* Decision badge */}
            <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${decisionStyle.cls}`}>
              <span className="text-2xl">{decisionStyle.icon}</span>
              <span className="text-xl font-bold">{decisionStyle.label}</span>
            </div>

            {/* Local buyer match panel */}
            {routing.decision === 'local_resale' && routing.nearbyBuyers !== undefined && (
              <div className="rounded-xl border border-success/30 bg-success/10 p-4 space-y-3">
                <p className="font-semibold text-success">
                  {routing.nearbyBuyers} verified buyers within {routing.radiusKm}km
                </p>
                {routing.warehouseDistanceKm !== undefined && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-card p-3 text-center">
                      <p className="text-xs text-muted-foreground">Local route</p>
                      <p className="mt-1 text-xl font-bold text-success">{routing.radiusKm}km</p>
                      {routing.localMargin !== undefined && (
                        <p className="text-xs text-success">+{formatPrice(routing.localMargin)} recovered</p>
                      )}
                    </div>
                    <div className="rounded-lg bg-card p-3 text-center">
                      <p className="text-xs text-muted-foreground">Warehouse route</p>
                      <p className="mt-1 text-xl font-bold text-danger">{routing.warehouseDistanceKm}km</p>
                      {routing.warehouseMargin !== undefined && (
                        <p className="text-xs text-danger">{formatPrice(Math.abs(routing.warehouseMargin))} loss</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Refurbish partner */}
            {routing.decision === 'refurbish' && routing.warehouseDistanceKm !== undefined && (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 space-y-2">
                <p className="font-semibold text-warning">
                  Certified refurbishment partner{routing.radiusKm ? ` ${routing.radiusKm}km away` : ' nearby'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {routing.localMargin !== undefined && (
                    <div className="rounded-lg bg-card p-3 text-center">
                      <p className="text-xs text-muted-foreground">Local margin</p>
                      <p className="mt-1 text-lg font-bold text-success">+{formatPrice(routing.localMargin)}</p>
                    </div>
                  )}
                  {routing.warehouseMargin !== undefined && (
                    <div className="rounded-lg bg-card p-3 text-center">
                      <p className="text-xs text-muted-foreground">Warehouse margin</p>
                      <p className="mt-1 text-lg font-bold text-danger">{formatPrice(Math.abs(routing.warehouseMargin))} loss</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Donate */}
            {routing.decision === 'donate' && (
              <div className="rounded-xl border border-border bg-secondary p-4">
                <p className="text-sm text-muted-foreground">
                  Local resale margin below viability threshold. 2 NGO partners nearby accept this category.
                  Donation avoids {routing.warehouseDistanceKm}km warehouse freight.
                </p>
              </div>
            )}

            {/* Recycle */}
            {routing.decision === 'recycle' && (
              <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 p-4">
                <span className="text-xl">♻️</span>
                <p className="text-sm text-muted-foreground">
                  Certified local recycler. Zero landfill guaranteed.
                </p>
              </div>
            )}

            {/* Reasoning trace */}
            <div className="rounded-lg border-l-4 border-border bg-secondary p-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                AI reasoning
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{routing.reasoning}</p>
            </div>

            {/* CO₂ */}
            {routing.co2SavedKg > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-5 py-3">
                <span className="text-xl">🌿</span>
                <div>
                  <p className="font-semibold text-success">{routing.co2SavedKg}kg CO₂ avoided</p>
                  <p className="text-xs text-muted-foreground">vs. a warehouse round-trip for this item</p>
                </div>
              </div>
            )}

            {/* Fallback chain */}
            {isLocal && fallbackLabels.length > 0 && (
              <p className="text-xs text-muted-foreground">
                If unmatched in {routing.dwellBudgetHours}h → {fallbackLabels.join(' → ')}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-secondary p-4">
            <p className="text-sm text-muted-foreground">Routing decision pending.</p>
          </div>
        )}
      </Card>

      {/* Product Health Card */}
      {showHealthCard && (
        <Card>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-xl">
              🔒
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Product Health Card
              </p>
              <p className="mt-1 font-semibold text-foreground">Verified condition report created</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {grading?.grade && `Grade ${grading.grade} · `}
                {grading?.defects.join(', ') || 'No major defects'}.
                Authenticity {grading?.authenticityMatch ? 'verified' : 'flagged'}.
                This card travels with the item to{' '}
                {routing?.decision === 'refurbish' ? 'the refurbishment partner' : 'the next owner'}.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Economic summary */}
      {routing && (routing.localMargin !== undefined || routing.warehouseMargin !== undefined) && (
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
              Local routing saves you {formatPrice(routing.localMargin - routing.warehouseMargin)} vs warehouse
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
