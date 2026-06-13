'use client';

import { useEffect, useState } from 'react';
import type {
  HandoffScenario,
  ReturnFlowState,
  ReturnRoutingDecision,
  RoutingScenario,
} from '@reloop/shared';
import { mockRouteItem, mockHandoff } from '@/lib/mocks/return-flow';
import { Card } from '@/components/ui/card';

interface Props {
  flowState: ReturnFlowState;
  onNext: (partial: Partial<ReturnFlowState>) => void;
  routingScenario: string | undefined;
  handoffScenario: string | undefined;
}

type Status = 'loading' | 'error_fallback' | 'done';

const DECISION_STYLES: Record<ReturnRoutingDecision['decision'], { label: string; cls: string }> = {
  local_resale: { label: 'Local Buyer Match', cls: 'bg-success/20 text-success border-success/30' },
  refurbish: { label: 'Local Refurbishment', cls: 'bg-warning/20 text-warning border-warning/30' },
  donate: { label: 'Local Donation', cls: 'bg-secondary text-foreground border-border' },
  recycle: { label: 'Local Recycling', cls: 'bg-secondary text-brand border-border' },
  warehouse: { label: 'Warehouse Return', cls: 'bg-secondary text-muted-foreground border-border' },
  return_to_seller: { label: 'Return to Seller', cls: 'bg-brand/20 text-brand border-brand/30' },
};

function PulseSkeleton() {
  return (
    <Card>
      <div className="animate-pulse space-y-4">
        <div className="h-10 w-full rounded bg-secondary" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-secondary" />
          <div className="h-3 w-5/6 rounded bg-secondary" />
          <div className="h-3 w-4/6 rounded bg-secondary" />
        </div>
        <div className="h-6 w-32 rounded bg-secondary" />
        <div className="mt-4 text-center">
          <p className="text-sm font-semibold text-foreground">Searching for local buyers near you…</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Comparing local demand, handling costs, and carbon impact
          </p>
        </div>
      </div>
    </Card>
  );
}

function formatCurrency(paise: number) {
  return `₹${Math.abs(paise).toLocaleString('en-IN')}`;
}

export function Step3Bridge({ flowState, onNext, routingScenario, handoffScenario }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [decision, setDecision] = useState<ReturnRoutingDecision | null>(null);

  const rScenario = (routingScenario as RoutingScenario | undefined) ?? 'local_resale';
  const hScenario = (handoffScenario as HandoffScenario | undefined) ?? 'locker';

  useEffect(() => {
    void (async () => {
      try {
        const order = (await import('@/lib/mocks/return-flow')).mockOrders.find(
          (o) => o.orderId === flowState.orderId,
        );
        const res = await mockRouteItem(
          flowState.gradingResult ?? null,
          flowState.reason,
          order?.sku ?? '',
          rScenario,
        );
        setDecision(res);
        setStatus('done');
      } catch {
        setStatus('error_fallback');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleContinue() {
    if (!decision) return;
    const handoff = mockHandoff(decision.decision, hScenario);
    onNext({ routingDecision: decision, handoff: handoff ?? undefined, currentStep: 4 });
  }

  function handleErrorFallback() {
    const fallback: ReturnRoutingDecision = {
      decision: 'warehouse',
      reasoning: 'Routing engine unavailable. Proceeding with standard return.',
      co2SavedKg: 0,
      dwellBudgetHours: 0,
      sellerType: '1P',
      fallbackChain: [],
    };
    onNext({ routingDecision: fallback, handoff: undefined, currentStep: 4 });
  }

  if (status === 'loading') return <PulseSkeleton />;

  if (status === 'error_fallback') {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Unable to compute routing at this time. Proceeding with standard return.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleErrorFallback}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
          >
            Continue
          </button>
        </div>
      </Card>
    );
  }

  if (!decision) return null;

  const style = DECISION_STYLES[decision.decision];
  const fallbackLabels = decision.fallbackChain.map((d) => DECISION_STYLES[d]?.label ?? d);
  const isLocal = decision.decision !== 'warehouse' && decision.decision !== 'return_to_seller';

  return (
    <Card>
      <div className="space-y-5">
        {/* Grading-deferred notice */}
        {!flowState.gradingResult && (
          <div className="rounded-lg border border-border bg-secondary p-3">
            <p className="text-sm text-muted-foreground">
              No pre-grading — condition will be verified in person at pickup before any resale.
            </p>
          </div>
        )}

        {/* Decision badge */}
        <div
          className={`flex items-center justify-center rounded-lg border px-6 py-4 text-xl font-bold ${style.cls}`}
        >
          {style.label}
        </div>

        {/* Local buyer match panel — the core value prop */}
        {decision.decision === 'local_resale' && decision.nearbyBuyers !== undefined && (
          <div className="rounded-lg border border-success/30 bg-success/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-success">
                {decision.nearbyBuyers} verified buyers found within {decision.radiusKm}km
              </span>
              <span className="text-xs text-muted-foreground">matched by Amazon</span>
            </div>
            {decision.warehouseDistanceKm !== undefined && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-lg bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Local route</p>
                  <p className="mt-1 text-lg font-bold text-success">{decision.radiusKm}km</p>
                  {decision.localMargin !== undefined && (
                    <p className="text-xs text-success">+{formatCurrency(decision.localMargin)} recovered</p>
                  )}
                </div>
                <div className="rounded-lg bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">Warehouse route</p>
                  <p className="mt-1 text-lg font-bold text-danger">{decision.warehouseDistanceKm}km</p>
                  {decision.warehouseMargin !== undefined && (
                    <p className="text-xs text-danger">{formatCurrency(decision.warehouseMargin)} loss</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Refurbish local comparison row */}
        {decision.decision === 'refurbish' && decision.warehouseDistanceKm !== undefined && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
            <p className="text-sm font-semibold text-warning">
              Refurbishment partner found {decision.radiusKm ? `${decision.radiusKm}km away` : 'nearby'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              vs. {decision.warehouseDistanceKm}km warehouse round-trip
              {decision.warehouseMargin !== undefined && ` (projected ${formatCurrency(decision.warehouseMargin)} loss)`}
            </p>
          </div>
        )}

        {/* Recycle */}
        {decision.decision === 'recycle' && (
          <div className="flex items-center gap-2 text-brand">
            <span>♻️</span>
            <span className="text-sm">Certified local recycler. Zero landfill guaranteed.</span>
          </div>
        )}

        {/* Return to seller */}
        {decision.decision === 'return_to_seller' && (
          <div className="rounded-lg border border-border bg-secondary p-3">
            <p className="text-sm text-muted-foreground">
              This item will be returned to the seller per their policy. Your refund is unaffected.
            </p>
          </div>
        )}

        {/* Warehouse note — last resort */}
        {decision.decision === 'warehouse' && (
          <div className="rounded-lg border border-border bg-secondary p-3">
            <p className="text-sm text-muted-foreground">
              No local buyers or partners found nearby. Standard warehouse return will be used.
            </p>
          </div>
        )}

        {/* Reasoning trace */}
        <div className="rounded-lg border-l-4 border-border bg-secondary p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{decision.reasoning}</p>
        </div>

        {/* CO₂ badge */}
        {decision.co2SavedKg > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full bg-success/15 px-4 py-1.5">
            <span className="text-success">🌿</span>
            <span className="text-sm font-semibold text-success">
              {decision.co2SavedKg}kg CO₂ saved vs warehouse route
            </span>
          </div>
        )}

        {/* Fallback chain */}
        {isLocal && fallbackLabels.length > 0 && (
          <p className="text-xs text-muted-foreground">
            If unmatched in {decision.dwellBudgetHours}h → {fallbackLabels.join(' → ')}
          </p>
        )}

        {/* 3P opt-in note */}
        {decision.sellerType === '3P' && decision.decision !== 'return_to_seller' && (
          <p className="text-xs text-muted-foreground">Seller has opted into local routing.</p>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleContinue}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
          >
            Continue
          </button>
        </div>
      </div>
    </Card>
  );
}
