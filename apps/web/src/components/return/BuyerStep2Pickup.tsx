'use client';

import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react';
import type {
  ReturnGradingResult,
  ReturnHealthCard,
  ReturnRoutingDecision,
  ReturnReason,
  ReturnManifest,
  ReturnJobResult,
} from '@reloop/shared';
import { mockGradeItem, mockRouteItem } from '@/lib/mocks/return-flow';
import { gradeReturnItem, routeReturnItem, createReturnHealthCard } from '@/lib/api-client';
import { saveReturn, generateReturnId } from '@/lib/mocks/return-store';
import { initReturn, submitReturnPhotos, pollReturnStatus } from '@/lib/return-pipeline-api';
import { Card } from '@/components/ui/card';
import { LeafletMap } from '@/components/map/LeafletMap';
import {
  ScanIcon,
  MapPinIcon,
  ClipboardCheckIcon,
  TruckIcon,
  PackageIcon,
  CardIcon,
  CheckIcon,
  ArrowRightIcon,
  ShieldIcon,
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

type Phase = 'grading' | 'routing' | 'health_card' | 'processing' | 'saving' | 'ready';
type HealthCardResult = ReturnHealthCard | { fallback: true; summary: string };

// Spec 025: how long to poll the async return-worker Lambda before giving up
// and falling back to the synchronous mock path.
const ASYNC_POLL_TIMEOUT_MS = 120_000;
const ASYNC_POLL_INTERVAL_MS = 2_000;

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
  { key: 'health_card', label: 'Building your Product Health Card', Icon: ShieldIcon },
  { key: 'saving', label: 'Confirming your return', Icon: ClipboardCheckIcon },
];

const PHASE_ORDER: Phase[] = ['grading', 'routing', 'health_card', 'saving', 'ready'];

// Spec 025: the async pipeline (S3 -> SQS -> Lambda) grades, routes, and mints
// the Health Card in one server-side job — the client only sees PENDING vs.
// DONE, not each stage, so it gets a single combined step instead of three.
const ASYNC_PHASE_STEPS: { key: Phase; label: string; Icon: Icon }[] = [
  { key: 'processing', label: 'Grading, routing, and building your Health Card', Icon: ScanIcon },
  { key: 'saving', label: 'Confirming your return', Icon: ClipboardCheckIcon },
];

const ASYNC_PHASE_ORDER: Phase[] = ['processing', 'saving', 'ready'];

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-success/20 text-success border-success/30',
  B: 'bg-warning/20 text-warning border-warning/30',
  C: 'bg-brand/20 text-brand border-brand/30',
  Salvage: 'bg-danger/20 text-danger border-danger/30',
};

const DECISION_META: Record<ReturnRoutingDecision['decision'], { label: string; cls: string }> = {
  restock: { label: 'Direct Restock', cls: 'bg-success/20 text-success border-success/30' },
  local_resale: { label: 'Local Buyer Match', cls: 'bg-success/20 text-success border-success/30' },
  refurbish: { label: 'Local Refurbishment', cls: 'bg-warning/20 text-warning border-warning/30' },
  liquidate: { label: 'Hub Pallet (Manifested)', cls: 'bg-warning/20 text-warning border-warning/30' },
  donate: { label: 'Local Donation', cls: 'bg-secondary text-foreground border-border' },
  recycle: { label: 'Local Recycling', cls: 'bg-secondary text-brand border-border' },
  warehouse: { label: 'Warehouse Return', cls: 'bg-secondary text-muted-foreground border-border' },
  return_to_seller: { label: 'Return to Seller', cls: 'bg-brand/20 text-brand border-brand/30' },
  returnless_refund: { label: 'Keep It — Refund Issued', cls: 'bg-success/20 text-success border-success/30' },
};

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

function inr(paise: number) {
  return `₹${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;
}

export function BuyerStep2Pickup({
  orderId, productName, priceCents, category, sku, reason, photos, onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>('grading');
  const [asyncMode, setAsyncMode] = useState(false);
  const [agentWindow] = useState(computeAgentWindow);
  const [grading, setGrading] = useState<ReturnGradingResult | null>(null);
  const [routing, setRouting] = useState<ReturnRoutingDecision | null>(null);
  const [healthCard, setHealthCard] = useState<HealthCardResult | null>(null);

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
            const res = await gradeReturnItem({ photos, reason, sku });
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

  const activeSteps = asyncMode ? ASYNC_PHASE_STEPS : PHASE_STEPS;
  const activeOrder = asyncMode ? ASYNC_PHASE_ORDER : PHASE_ORDER;
  const currentIdx = activeOrder.indexOf(phase);

  const evPaths = useMemo(() => {
    if (!routing?.evBreakdown) return null;
    return [...routing.evBreakdown.paths].sort((a, b) => b.evCents - a.evCents);
  }, [routing]);

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

  const gradeCls = grading?.grade ? GRADE_COLORS[grading.grade] : 'bg-secondary text-muted-foreground border-border';
  const meta = routing ? DECISION_META[routing.decision] : null;
  const fallbackLabels = routing?.fallbackChain.map((d) => DECISION_META[d]?.label ?? d) ?? [];
  const isLocal =
    !!routing &&
    routing.decision !== 'warehouse' &&
    routing.decision !== 'return_to_seller' &&
    routing.decision !== 'returnless_refund';
  const cardFallback = healthCard && 'fallback' in healthCard;

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

      {/* AI Grading — doorstep assessment (the "eyes") */}
      {grading && (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            AI Grading — doorstep assessment
          </p>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {grading.grade && (
                <span className={`rounded-xl border px-4 py-2 text-sm font-bold tracking-wide ${gradeCls}`}>
                  Grade {grading.grade}
                </span>
              )}
              {grading.authenticityMatch ? (
                <span className="text-sm text-success">✓ Matches product records</span>
              ) : (
                <span className="text-sm text-warning">⚠ Mismatch detected</span>
              )}
            </div>

            <ConfidenceBar label="AI Confidence" value={grading.confidence} />

            {grading.confidence < 0.6 && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm text-warning">
                  Visual grading wasn't fully conclusive — your item will be verified in person
                  before any resale.
                </p>
              </div>
            )}

            {!grading.authenticityMatch && (
              <div className="rounded-lg border-l-4 border-warning bg-warning/10 p-3">
                <p className="text-sm text-warning">
                  These photos don't fully match your product's records. Your return has been
                  flagged for a closer look at pickup.
                </p>
              </div>
            )}

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

            {grading.wardrobingFlag && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm text-warning">
                  Wardrobe return flag: evidence of extended use detected.
                </p>
              </div>
            )}

            {!grading.functionallyVerifiable && (
              <div className="rounded-lg border border-border bg-secondary p-3">
                <p className="text-sm text-muted-foreground">
                  Functional condition can't be verified from photos alone — it will be tested
                  before resale.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Product Health Card — the trust layer, minted at the return click */}
      {healthCard && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <ShieldIcon className="h-4 w-4 text-brand" />
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
              Product Health Card
            </p>
          </div>
          {cardFallback ? (
            <p className="text-sm text-muted-foreground">{(healthCard as { summary: string }).summary}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-foreground">{(healthCard as ReturnHealthCard).summary}</p>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-secondary">
                  <div
                    className="h-1.5 rounded-full bg-success"
                    style={{ width: `${(healthCard as ReturnHealthCard).trustScore}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-success">
                  {(healthCard as ReturnHealthCard).trustScore}/100 trust score
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
                <ul className="space-y-1">
                  {(healthCard as ReturnHealthCard).notVerified.map((a) => (
                    <li key={a} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5">–</span>{a}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">This card travels with the item to its next owner.</p>
            </div>
          )}
        </Card>
      )}

      {/* Intelligent Bridge — glass-box EV breakdown (logic decides, model narrates) */}
      {routing && meta && (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            Intelligent Bridge · why {meta.label}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            We compared the expected value of every path — recovered value minus handling,
            freight, and carbon. The best one wins.
          </p>

          <div
            className={`mt-4 flex items-center justify-center rounded-lg border px-6 py-4 text-lg font-bold ${meta.cls}`}
          >
            {meta.label}
          </div>

          {evPaths && (
            <div className="mt-4 space-y-2">
              {evPaths.map((p) => {
                const isChosen = p.path === routing.decision;
                const label = DECISION_META[p.path]?.label ?? p.path;
                return (
                  <div key={p.path} className="space-y-1">
                    <div
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        isChosen ? 'bg-brand/10 ring-1 ring-brand/40' : 'bg-secondary/50'
                      } ${p.viable ? '' : 'opacity-60'}`}
                    >
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        {isChosen && <CheckIcon className="h-4 w-4 text-brand" />}
                        {label}
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
                    {!p.viable && p.gateReason && (
                      <p className="px-3 text-xs text-muted-foreground">{p.gateReason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Per-decision explanation */}
          {routing.decision === 'local_resale' && routing.nearbyBuyers !== undefined && (
            <div className="mt-4 space-y-3 rounded-lg border border-success/30 bg-success/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-success">
                  {routing.nearbyBuyers} verified buyers found within {routing.radiusKm}km
                </span>
                <span className="text-xs text-muted-foreground">matched by Amazon</span>
              </div>
              {routing.warehouseDistanceKm !== undefined && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Local route</p>
                    <p className="mt-1 text-lg font-bold text-success">{routing.radiusKm}km</p>
                    {routing.localMargin !== undefined && (
                      <p className="text-xs text-success">+{inr(routing.localMargin * 100)} recovered</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Warehouse route</p>
                    <p className="mt-1 text-lg font-bold text-danger">{routing.warehouseDistanceKm}km</p>
                    {routing.warehouseMargin !== undefined && (
                      <p className="text-xs text-danger">{inr(routing.warehouseMargin * 100)} loss</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {routing.decision === 'refurbish' && routing.warehouseDistanceKm !== undefined && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4">
              <p className="text-sm font-semibold text-warning">
                Refurbishment partner found {routing.radiusKm ? `${routing.radiusKm}km away` : 'nearby'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                vs. {routing.warehouseDistanceKm}km warehouse round-trip
                {routing.warehouseMargin !== undefined && ` (projected ${inr(routing.warehouseMargin * 100)} loss)`}
              </p>
            </div>
          )}

          {routing.decision === 'liquidate' && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4">
              <p className="text-sm font-semibold text-warning">Staged into a graded pallet at your local hub</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Every unit carries its Health Card — manifested pallets sell for 30–50% more than
                mystery lots, with no {routing.warehouseDistanceKm ?? 580}km linehaul.
              </p>
            </div>
          )}

          {routing.decision === 'returnless_refund' && (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-4">
              <p className="text-sm font-semibold text-success">No pickup needed — your refund is on its way</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Every return route costs more than it recovers for this item, so it stays with
                you. Zero trips, zero packaging, zero carbon.
              </p>
            </div>
          )}

          {routing.decision === 'recycle' && (
            <div className="mt-4 flex items-center gap-2 text-brand">
              <span>♻️</span>
              <span className="text-sm">Certified local recycler. Zero landfill guaranteed.</span>
            </div>
          )}

          {routing.decision === 'return_to_seller' && (
            <div className="mt-4 rounded-lg border border-border bg-secondary p-3">
              <p className="text-sm text-muted-foreground">
                This item will be returned to the seller per their policy. Your refund is unaffected.
              </p>
            </div>
          )}

          {routing.decision === 'warehouse' && (
            <div className="mt-4 rounded-lg border border-border bg-secondary p-3">
              <p className="text-sm text-muted-foreground">
                No local buyers or partners found nearby. Standard warehouse return will be used.
              </p>
            </div>
          )}

          {/* Intelligent Bridge map — origin → destination, with the same
              radius/eco-credit numbers already shown above, just visualized. */}
          {routing.origin && routing.destination && (
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <LeafletMap
                center={{
                  lat: (routing.origin.lat + routing.destination.lat) / 2,
                  lng: (routing.origin.lng + routing.destination.lng) / 2,
                }}
                zoom={11}
                markers={[
                  { lat: routing.origin.lat, lng: routing.origin.lng, label: 'Pickup location', tone: 'brand' },
                  {
                    lat: routing.destination.lat,
                    lng: routing.destination.lng,
                    label: routing.destination.label,
                    popup: `${routing.radiusKm ?? '?'}km away${
                      routing.voucherEcoCredits ? ` · +${routing.voucherEcoCredits} eco credits` : ''
                    }`,
                    tone: 'success',
                  },
                ]}
                line={[routing.origin, routing.destination]}
              />
            </div>
          )}

          {/* Reasoning trace */}
          <div className="mt-4 rounded-lg border-l-4 border-border bg-secondary p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{routing.reasoning}</p>
          </div>

          {routing.co2SavedKg > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-success/15 px-4 py-1.5">
              <span className="text-success">🌿</span>
              <span className="text-sm font-semibold text-success">
                {routing.co2SavedKg}kg CO₂ saved vs warehouse route
              </span>
            </div>
          )}

          {isLocal && fallbackLabels.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              If unmatched in {routing.dwellBudgetHours}h → {fallbackLabels.join(' → ')}
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
