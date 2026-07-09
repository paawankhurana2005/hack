'use client';

import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import type {
  ReturnGradingResult,
  ReturnHealthCard,
  ReturnRoutingDecision,
  ReturnReason,
  ReturnManifest,
  ReturnJobResult,
  ReturnStateTransition,
} from '@reloop/shared';
import { mockGradeItem, mockRouteItem } from '@/lib/mocks/return-flow';
import { gradeReturnItem, routeReturnItem, createReturnHealthCard } from '@/lib/api-client';
import type { CapturedAngle } from './BuyerStep1';
import { saveReturn, generateReturnId } from '@/lib/mocks/return-store';
import { initReturn, submitReturnPhotos, pollReturnStatus } from '@/lib/return-pipeline-api';
import { Card } from '@/components/ui/card';
import {
  ScanIcon,
  ClipboardCheckIcon,
  TruckIcon,
  PackageIcon,
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
  images: CapturedAngle[];
  onDone: (agentWindow: string) => void;
}

type Phase = 'grading' | 'routing' | 'health_card' | 'processing' | 'saving' | 'ready';
type HealthCardResult = ReturnHealthCard | { fallback: true; summary: string };

// Spec 025: how long to poll the async return-worker Lambda before giving up
// and falling back to the synchronous mock path.
const ASYNC_POLL_TIMEOUT_MS = 120_000;
const ASYNC_POLL_INTERVAL_MS = 2_000;

/** Pickup lands 5–7 days out, not same-day. */
function computeAgentWindow() {
  const day = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmt(day(5))} – ${fmt(day(7))}`;
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Routing and the Health Card still run (the seller dashboard and the lifecycle
// need them) — they're just not narrated to the buyer, who only cares that the
// photos were graded and the return was booked.
const PHASE_STEPS: { key: Phase; label: string; Icon: Icon }[] = [
  { key: 'grading', label: 'Grading your photos', Icon: ScanIcon },
  { key: 'saving', label: 'Confirming your return', Icon: ClipboardCheckIcon },
];

const PHASE_ORDER: Phase[] = ['grading', 'saving', 'ready'];

/** Collapse the hidden phases onto the step the buyer sees them as. */
function displayPhase(p: Phase): Phase {
  return p === 'routing' || p === 'health_card' ? 'saving' : p;
}

// Spec 025: the async pipeline (S3 -> SQS -> Lambda) grades, routes, and mints
// the Health Card in one server-side job — the client only sees PENDING vs.
// DONE, not each stage, so it gets a single combined step instead of three.
const ASYNC_PHASE_STEPS: { key: Phase; label: string; Icon: Icon }[] = [
  { key: 'processing', label: 'Grading your photos', Icon: ScanIcon },
  { key: 'saving', label: 'Confirming your return', Icon: ClipboardCheckIcon },
];

const ASYNC_PHASE_ORDER: Phase[] = ['processing', 'saving', 'ready'];

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const tier = value >= 0.8 ? 'High' : value >= 0.6 ? 'Medium' : 'Low';
  const color = value >= 0.8 ? 'bg-success' : value >= 0.6 ? 'bg-warning' : 'bg-danger';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold">{tier} ({pct}%)</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// The trained grader's raw output. Band colours mirror its own score→grade cuts:
// >=0.80 like-new/new, >=0.55 good, >=0.25 fair, else poor.
function ScoreBar({ value }: { value: number }) {
  const color = value >= 0.8 ? 'bg-success' : value >= 0.55 ? 'bg-warning' : 'bg-danger';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>Condition score</span>
        <span className="font-mono font-semibold text-foreground">{value.toFixed(3)} / 1.00</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary">
        <div
          className={`h-2 rounded-full ${color} transition-all`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function BuyerStep2Pickup({
  orderId, productName, priceCents, category, sku, reason, images, onDone,
}: Props) {
  // Flat data-URLs for persistence / mock grading; the angle tags go to the API.
  const photos = images.map((im) => im.dataUrl);
  const [phase, setPhase] = useState<Phase>('grading');
  const [asyncMode, setAsyncMode] = useState(false);
  const [agentWindow] = useState(computeAgentWindow);
  const [grading, setGrading] = useState<ReturnGradingResult | null>(null);
  // Routing and the Health Card still run and are still persisted onto the return
  // record (the seller dashboard reads them) — the buyer just isn't shown them,
  // so only the setters are read here.
  const [, setRouting] = useState<ReturnRoutingDecision | null>(null);
  const [, setHealthCard] = useState<HealthCardResult | null>(null);

  useEffect(() => {
    // Spec 025: resolves a job's raw (possibly-fallback) results into the same
    // fully-typed shapes the synchronous path guarantees, using the same mock
    // fallback the sync path uses when the server reports `fallback: true`.
    async function resolveJobResult(jobResult: ReturnJobResult) {
      let gr: ReturnGradingResult | null =
        'fallback' in jobResult.gradingResult ? null : jobResult.gradingResult;
      if (!gr) gr = await mockGradeItem(reason, photos, 'high_confidence');

      let rd: ReturnRoutingDecision | null =
        'fallback' in jobResult.routingDecision ? null : jobResult.routingDecision;
      if (!rd) rd = await mockRouteItem(gr, reason, sku, 'local_resale');

      return { grading: gr, routing: rd, card: jobResult.healthCard };
    }

    void (async () => {
      const returnId = generateReturnId();
      let gradingResult: ReturnGradingResult | null = null;
      let routingDecision: ReturnRoutingDecision | null = null;
      let card: HealthCardResult | null = null;
      let resolvedAsync = false;

      // --- Spec 025: try the async S3 -> SQS -> Lambda pipeline first -------
      // initReturn/pollReturnStatus degrade gracefully (return null) when the
      // API's AWS credentials aren't configured, so this always attempts and
      // falls through to the synchronous path below on any failure.
      if (photos.length > 0) {
        setAsyncMode(true);
        setPhase('processing');
        try {
          const init = await initReturn(returnId, photos.length);
          if (init) {
            const manifest: ReturnManifest = {
              returnId,
              orderId,
              sku,
              reason,
              sellerType: '1P',
              photoCount: photos.length,
              createdAt: new Date().toISOString(),
            };
            const uploaded = await submitReturnPhotos(init, photos, manifest);
            if (uploaded) {
              const deadline = Date.now() + ASYNC_POLL_TIMEOUT_MS;
              while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, ASYNC_POLL_INTERVAL_MS));
                const status = await pollReturnStatus(returnId);
                if (status?.status === 'DONE' && status.result) {
                  const resolved = await resolveJobResult(status.result);
                  gradingResult = resolved.grading;
                  routingDecision = resolved.routing;
                  card = resolved.card;
                  resolvedAsync = true;
                  break;
                }
                if (status?.status === 'FAILED') break;
              }
            }
          }
        } catch {
          // fall through to the synchronous path below
        }
      }

      if (resolvedAsync) {
        setGrading(gradingResult);
        setRouting(routingDecision);
        setHealthCard(card);
      } else {
        setAsyncMode(false);

        // --- Stage 1: doorstep grading (real /api/grade, mock fallback) ----
        if (photos.length > 0) {
          setPhase('grading');
          try {
            const res = await gradeReturnItem({
              images: images.map((im) => ({ angle: im.angle, imageBase64: im.dataUrl })),
              reason,
              sku,
              category,
            });
            gradingResult = 'fallback' in res ? await mockGradeItem(reason, photos, 'high_confidence') : res;
          } catch {
            try {
              gradingResult = await mockGradeItem(reason, photos, 'high_confidence');
            } catch {
              gradingResult = null;
            }
          }
          setGrading(gradingResult);
        } else {
          setPhase('grading');
          // no photos — simulate a quick pause
          await new Promise((r) => setTimeout(r, 1200));
        }
        setPhase('routing');

        // --- Stage 3: the Intelligent Bridge (real /api/route, mock fallback)
        try {
          // Demo catalog is 1P-only — no sellerType is threaded through MockOrder yet.
          const res = await routeReturnItem({ gradingResult, reason, sku, sellerType: '1P' });
          routingDecision =
            'fallback' in res ? await mockRouteItem(gradingResult, reason, sku, 'local_resale') : res;
        } catch {
          try {
            routingDecision = await mockRouteItem(gradingResult, reason, sku, 'local_resale');
          } catch {
            routingDecision = null;
          }
        }
        setRouting(routingDecision);
        setPhase('health_card');

        // --- The Product Health Card — minted at the return click (spec 016)
        if (gradingResult && photos.length > 0) {
          try {
            card = await createReturnHealthCard({ gradingResult });
          } catch {
            // Enrichment only — never blocks return submission.
          }
        } else {
          await new Promise((r) => setTimeout(r, 400));
        }
        setHealthCard(card);
      }

      setPhase('saving');
      await new Promise((r) => setTimeout(r, 800));

      const isGradeALocalResale =
        gradingResult?.grade === 'A' && routingDecision?.decision === 'local_resale';

      const nowIso = new Date().toISOString();
      const returnTransitions: ReturnStateTransition[] = [
        { from: 'initiated', to: 'evidence_captured', at: nowIso },
        { from: 'evidence_captured', to: 'routed', at: nowIso, decision: routingDecision ?? undefined },
      ];

      saveReturn({
        returnId,
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
        healthCard: card ?? undefined,
        submittedAt: nowIso,
        // Start of the 5–7 day pickup window the buyer was shown (computeAgentWindow).
        agentArrivesAt: new Date(Date.now() + 5 * 24 * 3600000).toISOString(),
        status: isGradeALocalResale ? 'pending_seller_approval' : 'awaiting_pickup',
        // Spec 016: the lifecycle starts here — decided before the item moves.
        lifecycleState: 'routed',
        transitions: returnTransitions,
      });

      setPhase('ready');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSteps = asyncMode ? ASYNC_PHASE_STEPS : PHASE_STEPS;
  const activeOrder = asyncMode ? ASYNC_PHASE_ORDER : PHASE_ORDER;
  const currentIdx = activeOrder.indexOf(asyncMode ? phase : displayPhase(phase));
  if (phase !== 'ready') {
    return (
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Processing your return
        </p>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          {asyncMode
            ? 'This can take up to a couple of minutes — no need to refresh.'
            : 'This takes a few seconds — no need to refresh.'}
        </p>
        <div className="space-y-4">
          {activeSteps.map((step, i) => {
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
          <p className="font-semibold text-foreground">Return confirmed</p>
        </div>

        {/* Pickup window */}
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 flex-shrink-0 place-items-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/20">
              <TruckIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold text-foreground">Amazon agent pickup</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Between <span className="font-semibold text-foreground">{agentWindow}</span>
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

      {/* AI Grading — the model's two numbers, nothing else. */}
      {grading && (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            AI Grading — doorstep assessment
          </p>
          <div className="mt-4 space-y-4">
            {typeof grading.conditionScore === 'number' && (
              <ScoreBar value={grading.conditionScore} />
            )}
            <ConfidenceBar label="AI Confidence" value={grading.confidence} />
          </div>
        </Card>
      )}

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
