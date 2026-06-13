'use client';

import { useEffect, useState } from 'react';
import type { ReturnGradingResult, ReturnRoutingDecision, ReturnReason } from '@reloop/shared';
import { mockGradeItem, mockRouteItem } from '@/lib/mocks/return-flow';
import { saveReturn, generateReturnId } from '@/lib/mocks/return-store';
import { Card } from '@/components/ui/card';

interface Props {
  orderId: string;
  productName: string;
  priceCents: number;
  category: string;
  sku: string;
  reason: ReturnReason;
  photos: string[];
  onDone: (agentWindow: string) => void;
}

type Phase = 'grading' | 'routing' | 'saving' | 'ready';

function computeAgentWindow() {
  const now = new Date();
  const start = new Date(now.getTime() + 2 * 3600000);
  const end = new Date(now.getTime() + 4 * 3600000);
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${fmt(start)} – ${fmt(end)}`;
}

const PHASE_STEPS: { key: Phase; label: string; icon: string }[] = [
  { key: 'grading', label: 'AI analyzing your photos', icon: '🔍' },
  { key: 'routing', label: 'Finding the best local path', icon: '🗺️' },
  { key: 'saving', label: 'Confirming your return', icon: '📋' },
];

const PHASE_ORDER: Phase[] = ['grading', 'routing', 'saving', 'ready'];

export function BuyerStep2Pickup({
  orderId, productName, priceCents, category, sku, reason, photos, onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>('grading');
  const [agentWindow] = useState(computeAgentWindow);

  useEffect(() => {
    void (async () => {
      let gradingResult: ReturnGradingResult | null = null;
      if (photos.length > 0) {
        try {
          gradingResult = await mockGradeItem(reason, photos, 'high_confidence');
        } catch {
          // continue
        }
      } else {
        // no photos — simulate a quick pause
        await new Promise((r) => setTimeout(r, 1200));
      }
      setPhase('routing');

      let routingDecision: ReturnRoutingDecision | null = null;
      try {
        routingDecision = await mockRouteItem(gradingResult, reason, sku, 'local_resale');
      } catch {
        // continue
      }
      setPhase('saving');

      await new Promise((r) => setTimeout(r, 800));

      saveReturn({
        returnId: generateReturnId(),
        orderId,
        productName,
        category,
        priceCents,
        reason,
        photoCount: photos.length,
        gradingResult,
        routingDecision,
        submittedAt: new Date().toISOString(),
        agentArrivesAt: new Date(Date.now() + 3 * 3600000).toISOString(),
        status: 'awaiting_pickup',
      });

      setPhase('ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentIdx = PHASE_ORDER.indexOf(phase);

  if (phase !== 'ready') {
    return (
      <Card>
        <p className="mb-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Processing your return
        </p>
        <div className="space-y-5">
          {PHASE_STEPS.map((step, i) => {
            const isDone = currentIdx > i;
            const isActive = currentIdx === i;
            return (
              <div key={step.key} className="flex items-center gap-4">
                <div
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base transition-all ${
                    isDone
                      ? 'bg-success/20 text-success'
                      : isActive
                        ? 'bg-brand/20 text-brand'
                        : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {isDone ? '✓' : <span className={isActive ? 'animate-pulse' : ''}>{step.icon}</span>}
                </div>
                <p
                  className={`text-sm ${
                    isDone ? 'text-success' : isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                  {isActive && <span className="ml-1 animate-pulse text-brand">…</span>}
                </p>
              </div>
            );
          })}
        </div>

        {/* Skeleton shimmer */}
        <div className="mt-6 animate-pulse space-y-2">
          <div className="h-2 w-2/3 rounded-full bg-secondary" />
          <div className="h-2 w-1/2 rounded-full bg-secondary" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20">
            <span className="text-lg text-success">✓</span>
          </div>
          <p className="font-semibold text-foreground">Return confirmed — agent dispatched</p>
        </div>

        {/* Agent ETA */}
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚚</span>
            <div>
              <p className="font-semibold text-foreground">Amazon agent arriving today</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Estimated window: <span className="font-semibold text-foreground">{agentWindow}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg bg-secondary/60 p-3">
            <span className="mt-0.5 text-brand">📦</span>
            <p className="text-sm text-muted-foreground">
              Package your item securely. The agent will collect it from your registered address — no drop-off needed.
            </p>
          </div>
        </div>
      </Card>

      {/* Refund notice */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <span className="mt-0.5 text-success">💳</span>
        <p className="text-sm text-muted-foreground">
          Your refund will be initiated once the agent picks up your item. Expect it within 5–7 business days.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onDone(agentWindow)}
          className="rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
        >
          Got it →
        </button>
      </div>
    </div>
  );
}
