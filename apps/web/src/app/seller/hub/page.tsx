'use client';

// Spec 016 — the local hub bench: the delivery-station checkpoint where a human
// confirms (or overrides) the doorstep AI grade and the SAME deterministic engine
// re-runs with the updated evidence. This is the last cheap redirect before an
// item commits to its route — wrong AI grades are caught HERE, before any buyer
// is exposed, and the correction costs a shelf move instead of a lost item.

import { useEffect, useMemo, useState } from 'react';
import {
  decideRoute,
  estimateImpact,
  posteriorFromPointGrade,
  type ConditionGrade,
  type Grade,
  type ItemCategory,
  type Money,
  type ReturnItemState,
  type ReturnRoutingDecision,
  type ReturnStateTransition,
  type RoutingEvProfile,
} from '@reloop/shared';
import Link from 'next/link';
import {
  getSubmittedReturns,
  lifecycleOf,
  linkListing,
  recordTransition,
  type SubmittedReturn,
} from '@/lib/mocks/return-store';
import { addListing } from '@/lib/listings-store';
import { ensureAgent } from '@/lib/agent-store';
import { demandCurve, SKU_TO_STORE_PRODUCT } from '@/lib/demand-graph';
import { findStoreProduct } from '@/mock/store-products';
import { currentAccountId } from '@/lib/storage';
import { getAccount } from '@/lib/accounts';
import type { CasualListing } from '@/mock/casual-listings';

const GRADES: Grade[] = ['A', 'B', 'C', 'Salvage'];

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
  rl_outbound: 'Standard RL outbound',
};

// Where a confirmed decision physically sends the item.
const EXEC_STATE: Record<ReturnRoutingDecision['decision'], ReturnItemState> = {
  restock: 'restock_outbound',
  local_resale: 'listed_local',
  refurbish: 'refurb_queue',
  donate: 'donation_batch',
  recycle: 'recycle_batch',
  warehouse: 'rl_outbound',
  return_to_seller: 'rl_outbound',
};

const PATH_LABEL: Record<ReturnRoutingDecision['decision'], string> = {
  restock: 'Restock as sellable',
  local_resale: 'Resell locally',
  refurbish: 'Refurbish',
  donate: 'Donate',
  recycle: 'Recycle',
  warehouse: 'Warehouse',
  return_to_seller: 'Return to seller',
};

const CHECKPOINT_FLOW: ReturnItemState[] = ['routed', 'pickup_verified', 'at_local_hub', 'hub_verified'];

function categoryOf(r: SubmittedReturn): ItemCategory {
  if (r.category === 'electronics') return 'electronics';
  if (r.category === 'apparel') return 'fashion';
  if (r.category === 'kitchenware') return 'home';
  return 'other';
}

function inr(paise: number) {
  return `₹${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;
}

const money = (amountCents: number): Money => ({ amountCents, currency: 'INR' });

// Return grade → the marketplace's condition vocabulary.
const CONDITION_OF: Record<Grade, ConditionGrade> = {
  A: 'like-new',
  B: 'good',
  C: 'fair',
  Salvage: 'poor',
};

// Open-box list price as a fraction of new retail, by verified grade.
const LIST_FRAC: Record<Grade, number> = { A: 0.78, B: 0.68, C: 0.55, Salvage: 0.35 };

const round50 = (paise: number) => Math.max(5000, Math.round(paise / 5000) * 5000);

/**
 * Spec 016 Stage 7 — the hub dispatch births the autonomous executor: a real
 * marketplace listing (buyable by other accounts) plus a Listing Agent instance
 * whose floor is the routing engine's route-elsewhere (warehouse/salvage) value —
 * so the agent escalates back to the Bridge exactly when local resale stops
 * beating "send it up the chain".
 */
function birthReturnListing(
  ret: SubmittedReturn,
  benchGrade: Grade,
  benchResult: ReturnType<typeof decideRoute>,
  category: ItemCategory,
): string {
  const retailCents = ret.priceCents;
  const listedCents = round50(retailCents * LIST_FRAC[benchGrade]);
  const comparableCents = Math.round(retailCents * 0.6); // same clearing proxy the bench profile uses
  const storeProductId = ret.sku ? SKU_TO_STORE_PRODUCT[ret.sku] : undefined;
  const storeProduct = storeProductId ? findStoreProduct(storeProductId) : undefined;

  // Floor = what the item is worth if the agent gives up locally (warehouse path EV),
  // clamped to a sane band under the list price.
  const salvageEv = benchResult.evByPath.find((p) => p.path === 'warehouse')?.evCents ?? 0;
  const floorCents = Math.max(
    Math.round(listedCents * 0.4),
    Math.min(Math.max(0, salvageEv), Math.round(listedCents * 0.85)),
  );

  const dg = demandCurve({
    category,
    priceCents: listedCents,
    retailCents,
    radiusKm: benchResult.radiusKm ?? 4,
    sku: ret.sku,
    storeProductId,
  });

  const now = new Date().toISOString();
  const listingId = `lst_ret_${ret.returnId}`;
  const itemId = `item_ret_${ret.returnId}`;
  const sellerId = currentAccountId();
  const driverScan = ret.transitions?.find((t) => t.to === 'pickup_verified');

  const listing: CasualListing = {
    id: listingId,
    itemId,
    title: ret.productName,
    imageUrl: storeProduct?.imageUrl ?? ret.photoUrls?.[0] ?? '',
    listedPrice: money(listedCents),
    status: 'listed',
    views: 0,
    listedAt: now,
    sellerId,
    sellerName: getAccount(sellerId)?.name ?? 'ReLoop Local Hub',
    // Shop-rendering data: the Health Card minted through the return's own checkpoints.
    originalPrice: money(retailCents),
    card: {
      id: `hc_${ret.returnId}`,
      productId: storeProductId ?? ret.orderId,
      itemId,
      title: ret.productName,
      grade: CONDITION_OF[benchGrade],
      confidence: 0.98, // human-verified at the bench
      summary: `Doorstep-graded ${benchGrade}, physically verified at the local hub bench. ${
        ret.gradingResult?.defects[0] ?? 'No notable defects.'
      }`,
      detectedIssues: ret.gradingResult?.defects ?? [],
      authenticityVerified: ret.gradingResult?.authenticityMatch ?? true,
      listingPrice: money(listedCents),
      history: [
        { label: 'Graded at the doorstep', at: ret.submittedAt },
        ...(driverScan ? [{ label: 'Driver verified at pickup', at: driverScan.at }] : []),
        { label: 'Hub bench verified · repackaged', at: now },
      ],
      healthCardUrl: `/card/${itemId}`,
      issuedAt: now,
    },
    impact: estimateImpact(category, money(listedCents)),
    // Agent metadata — the demand graph drives the market the agent reasons over.
    category,
    grade: CONDITION_OF[benchGrade],
    floorCents,
    retailCents,
    market: {
      comparableCents,
      localDemand: dg.localDemand,
      holdingCostPerDayCents: Math.max(2000, Math.round(listedCents * 0.01)),
      baseViewsPerDay: dg.baseViewsPerDay,
    },
    returnId: ret.returnId,
    storeProductId,
  };

  addListing(listing);
  ensureAgent(listing);
  linkListing(ret.returnId, listingId);
  return listingId;
}

export default function HubBenchPage() {
  const [returns, setReturns] = useState<SubmittedReturn[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Bench form state
  const [benchGrade, setBenchGrade] = useState<Grade>('A');
  const [sealIntact, setSealIntact] = useState(false);
  const [functionalPass, setFunctionalPass] = useState(true);

  useEffect(() => {
    const all = getSubmittedReturns().filter((r) => r.routingDecision !== null);
    setReturns(all);
    if (all.length > 0) setSelectedId(all[0]!.returnId);
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
    };
    return decideRoute(profile);
  }, [selected, benchGrade, sealIntact, functionalPass]);

  function refresh() {
    setReturns(getSubmittedReturns().filter((r) => r.routingDecision !== null));
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

  function handleConfirmDispatch() {
    if (!selected?.routingDecision || !benchResult) return;
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
    recordTransition(selected.returnId, {
      from: 'at_local_hub',
      to: 'hub_verified',
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
      from: 'hub_verified',
      to: EXEC_STATE[benchResult.decision],
      at: new Date().toISOString(),
    });
    // Spec 016 Stage 7: local resale doesn't end at "dispatched" — an autonomous
    // agent takes over the listing (reprice via spec-014, escalate via the Bridge).
    if (benchResult.decision === 'local_resale') {
      birthReturnListing(selected, benchGrade, benchResult, categoryOf(selected));
    }
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
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      AI: {r.gradingResult.grade} · {Math.round((r.gradingResult.confidence ?? 0) * 100)}%
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {returns.length === 0 && (
            <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-border">
              No routed returns in the queue yet — submit a return from the user app first.
            </p>
          )}
        </div>

        {/* Bench */}
        {selected && selected.routingDecision && (
          <div className="min-w-0 flex-1 space-y-4">
            {/* Lifecycle strip */}
            <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-card p-4 ring-1 ring-border">
              {CHECKPOINT_FLOW.map((s, i) => {
                const reached =
                  CHECKPOINT_FLOW.indexOf(state) >= i || !CHECKPOINT_FLOW.includes(state);
                const current = s === state;
                return (
                  <div key={s} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground">→</span>}
                    <span
                      className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${
                        current
                          ? 'bg-brand/20 text-brand'
                          : reached
                            ? 'bg-success/15 text-success'
                            : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {STATE_LABEL[s]}
                    </span>
                  </div>
                );
              })}
              {!CHECKPOINT_FLOW.includes(state) && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">→</span>
                  <span className="rounded-full bg-success/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-success">
                    {STATE_LABEL[state] ?? state}
                  </span>
                </div>
              )}
              {selected.routingDecision.ttlHours !== undefined && CHECKPOINT_FLOW.includes(state) && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Decision TTL {selected.routingDecision.ttlHours}h
                </span>
              )}
            </div>

            {/* Current decision */}
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Current route · decided {CHECKPOINT_FLOW.includes(state) ? 'at the doorstep' : 'at this bench'}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {PATH_LABEL[selected.routingDecision.decision]}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{selected.routingDecision.reasoning}</p>
            </div>

            {/* Stage action */}
            {state === 'routed' && (
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
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
              </div>
            )}

            {state === 'pickup_verified' && (
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
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
              </div>
            )}

            {state === 'at_local_hub' && benchResult && (
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
                <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                  Checkpoint 2 · Bench verification (last cheap redirect)
                </p>

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

                {/* Live re-evaluation preview */}
                <div
                  className={`mt-4 rounded-xl p-3 ring-1 ${
                    rerouted ? 'bg-warning/10 ring-warning/40' : 'bg-success/10 ring-success/30'
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Engine re-run with bench evidence
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {rerouted
                      ? `Re-routes: ${PATH_LABEL[selected.routingDecision.decision]} → ${PATH_LABEL[benchResult.decision]}`
                      : `Confirms: ${PATH_LABEL[benchResult.decision]}`}
                    {benchResult.hardRule ? ` (hard rule: ${benchResult.hardRule})` : ''}
                  </p>
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
                  onClick={handleConfirmDispatch}
                  className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                >
                  Confirm &amp; dispatch
                </button>
              </div>
            )}

            {!CHECKPOINT_FLOW.includes(state) && (
              <div className="rounded-2xl bg-success/10 p-4 ring-1 ring-success/30">
                <p className="font-mono text-[10px] uppercase tracking-widest text-success">
                  Dispatched · {STATE_LABEL[state] ?? state}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This item committed to its route after two human checkpoints. Every hub verdict is
                  also a labelled training pair for the doorstep grader — the flywheel.
                </p>
                {selected.listingId && (
                  <Link
                    href="/seller/local-listings"
                    className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                  >
                    Manage in Local Listings →
                  </Link>
                )}
              </div>
            )}

            {/* Transition log */}
            {(selected.transitions?.length ?? 0) > 0 && (
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
