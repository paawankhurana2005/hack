'use client';

// Dynamic-pricing demo surface (spec 014, Phase 6). Fire a market event at a sample
// listing and watch the engine return a clamped, narrated price — with the per-arm
// predicted reward (what the model PERCEIVES), the sell-through curve, and the guardrails
// that DECIDED the final number. Self-contained: it only calls /api/pricing/decide.

import { useState } from 'react';
import type { ConditionGrade, DemandEventType, PricingDecision } from '@reloop/shared';
import { PRICE_ARMS } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SellThroughCurve } from '@/components/pricing/sell-through-curve';
import { decidePricing, ApiRequestError, type PricingDecideRequest } from '@/lib/api-client';

const GRADES: ConditionGrade[] = ['new', 'like-new', 'good', 'fair', 'poor'];

const EVENTS: { type: DemandEventType; label: string; payload?: Record<string, unknown> }[] = [
  { type: 'initial_listing', label: 'Initial listing' },
  { type: 'comp_listed', label: 'Cheaper comp listed', payload: { price: 15000 } },
  { type: 'comp_sold', label: 'Comp sold nearby' },
  { type: 'view_velocity_drop', label: 'Views slowing', payload: { currentVelocity: 1 } },
  { type: 'dwell_threshold', label: 'Day 7 on market', payload: { daysOnMarket: 7 } },
  { type: 'heartbeat', label: 'Daily heartbeat' },
];

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export default function RepricePage() {
  const [grade, setGrade] = useState<ConditionGrade>('good');
  const [decision, setDecision] = useState<PricingDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fire(event: (typeof EVENTS)[number]) {
    setLoading(true);
    setError('');
    const req: PricingDecideRequest = {
      listingId: 'demo_iphone_13',
      event: { type: event.type, payload: event.payload ?? {} },
      state: {
        category: 'Electronics',
        gradeKey: grade,
        compMedianPrice: 18000,
        amazonNewPrice: 25000,
        sellerFloor: 9000,
        routeElsewhereValue: 7000,
        numReprices: decision ? 1 : 0,
      },
    };
    try {
      setDecision(await decidePricing(req));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Pricing request failed.');
    } finally {
      setLoading(false);
    }
  }

  const rewards = decision?.predictedRewards;
  const maxReward = rewards ? Math.max(...PRICE_ARMS.map((a) => rewards[a])) : 1;

  return (
    <PageShell
      eyebrow="Spec 014"
      title="Dynamic pricing"
      description="An event wakes the engine. XGBoost predicts the reward per price arm, a Thompson-sampling bandit picks one, deterministic guardrails clamp it, and the price is narrated. No RL."
    >
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Condition:</span>
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => setGrade(g)}
                className={`rounded-full px-3 py-1 text-sm ring-1 ${
                  g === grade ? 'bg-brand text-brand-foreground ring-brand' : 'bg-secondary ring-border'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {EVENTS.map((e) => (
              <Button key={e.type} variant="secondary" onClick={() => void fire(e)} disabled={loading}>
                {e.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Sample listing: iPhone 13, local median {inr(18000)}, floor {inr(9000)}, Amazon new {inr(25000)}.
          </p>
        </Card>

        {error && (
          <Card>
            <p className="text-sm text-destructive">{error}</p>
            <p className="mt-1 text-xs text-muted-foreground">Is the API running on the configured base URL?</p>
          </Card>
        )}

        {decision && (
          <>
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">New price</p>
                  <p className="text-4xl font-bold tabular-nums">{inr(decision.finalPrice)}</p>
                </div>
                <div className="text-right">
                  <Badge tone="accent">arm {decision.chosenArm}×</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    expected margin {inr(decision.expectedMargin)} · {decision.modelVersion}
                  </p>
                </div>
              </div>
              <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-sm">{decision.reason}</p>
              {decision.guardrailsApplied.some((g) => g.triggered) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {decision.guardrailsApplied
                    .filter((g) => g.triggered)
                    .map((g) => (
                      <Badge key={g.rule} tone="warning">
                        guardrail: {g.rule}
                      </Badge>
                    ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold">Predicted reward per arm (what the model sees)</h3>
              <div className="space-y-2">
                {PRICE_ARMS.map((arm) => {
                  const r = rewards ? rewards[arm] : 0;
                  const width = Math.max(2, Math.round((r / (maxReward || 1)) * 100));
                  const isChosen = arm === decision.chosenArm;
                  return (
                    <div key={arm} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 text-sm tabular-nums">{arm}×</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                        <div
                          className={`h-full rounded-full ${isChosen ? 'bg-brand' : 'bg-muted-foreground/40'}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                        {inr(r)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold">Sell-through curve</h3>
              <SellThroughCurve decision={decision} />
            </Card>
          </>
        )}
      </div>
    </PageShell>
  );
}
