'use client';

import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import type {
  ReturnGradingResult,
  ReturnRoutingDecision,
  ReturnReason,
  RoutingEvProfile,
} from '@reloop/shared';
import { evByPath } from '@reloop/shared';
import { mockGradeItem, mockRouteItem } from '@/lib/mocks/return-flow';
import { saveReturn, generateReturnId } from '@/lib/mocks/return-store';
import { Card } from '@/components/ui/card';
import {
  ScanIcon,
  MapPinIcon,
  ClipboardCheckIcon,
  TruckIcon,
  PackageIcon,
  CardIcon,
  CheckIcon,
  ArrowRightIcon,
} from './icons';

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

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const PHASE_STEPS: { key: Phase; label: string; Icon: Icon }[] = [
  { key: 'grading', label: 'Analyzing your photos', Icon: ScanIcon },
  { key: 'routing', label: 'Finding the best local path', Icon: MapPinIcon },
  { key: 'saving', label: 'Confirming your return', Icon: ClipboardCheckIcon },
];

const PHASE_ORDER: Phase[] = ['grading', 'routing', 'saving', 'ready'];

export function BuyerStep2Pickup({
  orderId, productName, priceCents, category, sku, reason, photos, onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>('grading');
  const [agentWindow] = useState(computeAgentWindow);
  const [routing, setRouting] = useState<ReturnRoutingDecision | null>(null);
  const [grade, setGrade] = useState<ReturnGradingResult['grade']>('B');

  useEffect(() => {
    void (async () => {
      let gradingResult: ReturnGradingResult | null = null;
      if (photos.length > 0) {
        try {
          gradingResult = await mockGradeItem(reason, photos, 'high_confidence');
          if (gradingResult) setGrade(gradingResult.grade);
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
        setRouting(routingDecision);
      } catch {
        // continue
      }
      setPhase('saving');

      await new Promise((r) => setTimeout(r, 800));

      const isGradeALocalResale =
        gradingResult?.grade === 'A' && routingDecision?.decision === 'local_resale';

      saveReturn({
        returnId: generateReturnId(),
        orderId,
        productName,
        category,
        priceCents,
        reason,
        sku, // spec 016: drives demand-graph matching + the open-box surface
        photoCount: photos.length,
        photoUrls: photos.length > 0 ? photos : undefined,
        gradingResult,
        routingDecision,
        submittedAt: new Date().toISOString(),
        agentArrivesAt: new Date(Date.now() + 3 * 3600000).toISOString(),
        status: isGradeALocalResale ? 'pending_seller_approval' : 'awaiting_pickup',
        // Spec 016: the lifecycle starts here — decided before the item moves.
        lifecycleState: 'routed',
        transitions: [
          { from: 'initiated', to: 'evidence_captured', at: new Date().toISOString() },
          { from: 'evidence_captured', to: 'routed', at: new Date().toISOString(), decision: routingDecision ?? undefined },
        ],
      });

      setPhase('ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentIdx = PHASE_ORDER.indexOf(phase);

  // Glass-box EV breakdown for the chosen path — the Intelligent Bridge "money shot".
  // Logic decides (the shared EV engine); inputs are grounded in this order's value.
  const evPaths = useMemo(() => {
    if (!routing) return null;
    const clearingPriceCents = Math.round(priceCents * 0.6); // resale clearing proxy
    const profile: RoutingEvProfile = {
      grade,
      reason,
      sellerType: routing.sellerType,
      sellerOptedIn: routing.sellerType === '1P',
      authenticityMatch: true,
      functionallyVerifiable: true,
      clearingPriceCents,
      localHandlingCents: Math.round(clearingPriceCents * 0.15),
      nearbyBuyers: routing.nearbyBuyers ?? 5,
      radiusKm: routing.radiusKm ?? 4,
      warehouseDistanceKm: routing.warehouseDistanceKm ?? 580,
    };
    return evByPath(profile);
  }, [routing, priceCents, reason, grade]);

  const PATH_LABEL: Record<ReturnRoutingDecision['decision'], string> = {
    restock: 'Restock as sellable',
    local_resale: 'Resell locally',
    refurbish: 'Refurbish',
    donate: 'Donate',
    recycle: 'Recycle',
    warehouse: 'Warehouse',
    return_to_seller: 'Return to seller',
  };
  const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

  if (phase !== 'ready') {
    return (
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Processing your return
        </p>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          This takes a few seconds — no need to refresh.
        </p>
        <div className="space-y-4">
          {PHASE_STEPS.map((step, i) => {
            const isDone = currentIdx > i;
            const isActive = currentIdx === i;
            const StepIcon = step.Icon;
            return (
              <div key={step.key} className="flex items-center gap-4">
                <div
                  className={`grid size-10 flex-shrink-0 place-items-center rounded-full transition-all ${
                    isDone
                      ? 'bg-brand/20 text-brand'
                      : isActive
                        ? 'bg-brand/15 text-brand ring-1 ring-brand/30'
                        : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {isDone ? (
                    <CheckIcon className="h-5 w-5" />
                  ) : (
                    <StepIcon className={`h-5 w-5 ${isActive ? 'animate-pulse' : ''}`} />
                  )}
                </div>
                <p
                  className={`text-sm ${
                    isDone
                      ? 'text-foreground'
                      : isActive
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground'
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
          <div className="grid size-10 flex-shrink-0 place-items-center rounded-full bg-brand/20 text-brand">
            <CheckIcon className="h-5 w-5" />
          </div>
          <p className="font-semibold text-foreground">Return confirmed — agent dispatched</p>
        </div>

        {/* Agent ETA */}
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 flex-shrink-0 place-items-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/20">
              <TruckIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold text-foreground">Amazon agent arriving today</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Estimated window: <span className="font-semibold text-foreground">{agentWindow}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-secondary/60 p-3">
            <PackageIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
            <p className="text-sm text-muted-foreground">
              Pack your item securely. The agent collects it from your registered address — no
              drop-off needed.
            </p>
          </div>
        </div>
      </Card>

      {/* Intelligent Bridge — glass-box EV breakdown (logic decides, model narrates) */}
      {routing && evPaths && (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            Intelligent Bridge · why {PATH_LABEL[routing.decision]}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            We compared the expected value of every path — recovered value minus handling,
            freight, and carbon. The best one wins.
          </p>
          <div className="mt-4 space-y-2">
            {[...evPaths]
              .sort((a, b) => b.evCents - a.evCents)
              .map((p) => {
                const isChosen = p.path === routing.decision;
                return (
                  <div
                    key={p.path}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      isChosen ? 'bg-brand/10 ring-1 ring-brand/40' : 'bg-secondary/50'
                    } ${p.viable ? '' : 'opacity-50'}`}
                  >
                    <span className="flex items-center gap-2 text-sm text-foreground">
                      {isChosen && <CheckIcon className="h-4 w-4 text-brand" />}
                      {PATH_LABEL[p.path]}
                      {!p.viable && (
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          n/a
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-mono text-sm tabular-nums ${
                        p.evCents >= 0 ? 'text-foreground' : 'text-danger'
                      }`}
                    >
                      {p.evCents >= 0 ? '+' : '−'}
                      {inr(p.evCents)}
                    </span>
                  </div>
                );
              })}
          </div>
          {routing.warehouseDistanceKm !== undefined && (
            <p className="mt-3 text-xs text-muted-foreground">
              Local route vs a {routing.warehouseDistanceKm}km warehouse round-trip
              {routing.co2SavedKg > 0 && ` · ${routing.co2SavedKg}kg CO₂ saved`}.
            </p>
          )}
        </Card>
      )}

      {/* Refund notice */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <CardIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
        <p className="text-sm text-muted-foreground">
          Your refund is initiated as soon as the agent picks up your item, and typically lands
          within 5–7 business days.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onDone(agentWindow)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground ring-1 ring-brand/50 transition-all hover:bg-brand-strong hover:shadow-[0_0_30px_rgba(234,179,8,0.25)]"
        >
          Continue
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
