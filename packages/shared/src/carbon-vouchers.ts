// Self-funding voucher engine for the RETURN flow (spec 015). Pure + deterministic
// + documented — reuses routing-ev.ts's already-computed EV/carbon terms, never
// recomputes freight or handling.
//
// Scope: 1P inventory only. For 1P, `evByPath()`'s EV delta between the chosen
// path and the warehouse counterfactual IS Amazon's own P&L — a real, already-
// computed number. Capping the voucher against a documented share of that delta
// (rather than an arbitrary carbon-credit multiplier) is what keeps this
// self-funding: Amazon never pays out more than a minority share of what it
// actually captured by not sending the item to the warehouse.
//
// SELL-flow / 3P-opted-in-RETURN are a deliberate Phase 2 roadmap item, not built
// here — Amazon's own capture there is an unmodeled marketplace commission, and
// inventing that number would be exactly the kind of unfounded guess this module
// is trying to eliminate. Those flows keep today's flat impact.ts formula.

import type { ItemCategory } from './sell.js';
import type { RoutingFactor } from './routing.js';
import { CENTS_PER_KG_CO2, CO2_LOCAL_KG, type PathEv, type ReturnPath } from './routing-ev.js';
import { computeAvoidedEmissionsKg, type AvoidedEmissionsRoute } from './carbon-methodology.js';

/** Routes that actually divert the item (vs. warehouse/return_to_seller, which have no counterfactual to fund against). */
const DIVERSION_ROUTE: Partial<Record<ReturnPath, AvoidedEmissionsRoute>> = {
  local_resale: 'resell',
  refurbish: 'refurbish',
  donate: 'donate',
  recycle: 'recycle',
};

// Share of Amazon's captured EV delta (vs. the warehouse counterfactual) that
// funds the voucher. Amazon keeps the majority of the upside it created — same
// logic typical affiliate/referral programs use for margin they helped generate.
// Tunable business constant, not a fact; documented here rather than buried inline.
export const FUNDING_SHARE = 0.25;

export interface ReturnVoucherResult {
  ecoCredits: number;
  co2SavedKg: number;
  /** Glass-box breakdown for on-screen display, same shape as routing factors. */
  factors: RoutingFactor[];
}

/**
 * Computes the EcoCredits earned for a 1P RETURN routed away from the warehouse,
 * capped by two independent guardrails: the carbon story (never reward more
 * carbon than was genuinely avoided) and Amazon's captured economics (never pay
 * out more than FUNDING_SHARE of what was actually saved vs. the warehouse path).
 *
 * `paths` must be `evByPath()`'s output and `freightAvoidedKg` must be
 * `decideRoute()`'s `co2SavedKg` for this decision — both reused, not recomputed.
 * Returns null for routes with no warehouse counterfactual to fund against
 * (warehouse itself, return_to_seller).
 */
export function computeReturnVoucherCredits(
  category: ItemCategory,
  route: ReturnPath,
  freightAvoidedKg: number,
  paths: PathEv[],
): ReturnVoucherResult | null {
  const avoidedRoute = DIVERSION_ROUTE[route];
  if (!avoidedRoute) return null;

  const chosen = paths.find((p) => p.path === route);
  const warehouse = paths.find((p) => p.path === 'warehouse');
  if (!chosen || !warehouse) return null;

  // Net local-logistics contribution: the small handling footprint minus the
  // freight avoided by not trucking to the warehouse (already computed upstream).
  const netLogisticsKg = CO2_LOCAL_KG - freightAvoidedKg;
  const netAvoidedKg = computeAvoidedEmissionsKg(category, avoidedRoute, netLogisticsKg);
  const carbonNarrativeCents = Math.round(netAvoidedKg * CENTS_PER_KG_CO2);

  const capturedEvDeltaCents = Math.max(0, chosen.evCents - warehouse.evCents);
  const fundedShareCents = Math.round(capturedEvDeltaCents * FUNDING_SHARE);
  const voucherBudgetCents = Math.min(carbonNarrativeCents, fundedShareCents);
  const ecoCredits = Math.round(voucherBudgetCents / 100); // 100 paise ≈ 1 EcoCredit, matching VOUCHER_TIERS

  if (ecoCredits <= 0) return null;

  const factors: RoutingFactor[] = [
    { label: 'Avoided emissions (net of logistics)', value: `${netAvoidedKg}kg CO2e`, weight: 1 },
    { label: 'Carbon value (internal price)', value: `₹${(carbonNarrativeCents / 100).toFixed(2)}`, weight: 1 },
    { label: 'Captured EV vs. warehouse', value: `₹${(capturedEvDeltaCents / 100).toFixed(2)}`, weight: 1 },
    {
      label: `Funded share (${Math.round(FUNDING_SHARE * 100)}%)`,
      value: `₹${(fundedShareCents / 100).toFixed(2)}`,
      weight: 1,
    },
    { label: 'Voucher budget (capped, min of the two)', value: `${ecoCredits} EcoCredits`, weight: 1 },
  ];

  return { ecoCredits, co2SavedKg: netAvoidedKg, factors };
}
