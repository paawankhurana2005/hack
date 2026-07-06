// Event significance filter — the hybrid trigger, shared by the API engine AND the web
// simulator so both decide "is this worth a reprice?" with identical logic. Most raw
// market events DIE here; only a meaningful change survives. A heartbeat cadence (owned
// by the caller) is the staleness backstop. In production this maps to EventBridge + SQS:
// only significant events ever invoke the pricing function.

import type { DemandEvent, DemandEventType, PricingReasonCode, PricingStateVector } from './types.js';

const REASON_BY_EVENT: Record<DemandEventType, PricingReasonCode> = {
  comp_sold: 'comp_sold_nearby',
  comp_listed: 'comp_listed_cheaper',
  asin_new_price_changed: 'amazon_new_price_dropped',
  view_velocity_drop: 'view_velocity_drop',
  dwell_threshold: 'dwell_threshold',
  save_no_purchase: 'save_no_purchase',
  heartbeat: 'heartbeat_staleness',
  initial_listing: 'initial_listing',
  seller_markdown: 'seller_markdown',
};

export function reasonCodeFor(type: DemandEventType): PricingReasonCode {
  return REASON_BY_EVENT[type];
}

/** Only the few fields the filter actually reads — so callers can pass a small object. */
export type SignificanceContext = Pick<
  PricingStateVector,
  'compMedianPrice' | 'amazonNewPrice' | 'viewVelocity24h'
>;

function num(payload: Record<string, unknown>, key: string, fallback = 0): number {
  const v = payload[key];
  return typeof v === 'number' ? v : fallback;
}

/** True when an event warrants a reprice. Most return false — that's the point. */
export function isSignificant(event: DemandEvent, ctx: SignificanceContext): boolean {
  const p = event.payload;
  switch (event.type) {
    case 'comp_sold':
      return true; // a real transaction cleared — always informative
    case 'comp_listed':
      return num(p, 'price') < ctx.compMedianPrice * 0.95; // undercuts us by >5%
    case 'asin_new_price_changed':
      return Math.abs((num(p, 'newPrice') - ctx.amazonNewPrice) / ctx.amazonNewPrice) > 0.08;
    case 'view_velocity_drop':
      return num(p, 'currentVelocity') < ctx.viewVelocity24h * 0.3; // sustained drop
    case 'dwell_threshold':
      return [3, 7, 14, 21].includes(num(p, 'daysOnMarket')); // milestone crossings only
    case 'save_no_purchase':
      return num(p, 'hoursSinceSave') > 72;
    case 'heartbeat':
      return true; // daily staleness backstop (caller gates the cadence)
    case 'initial_listing':
      return true; // first price
    case 'seller_markdown':
      return true; // deliberate seller action — always significant
    default:
      return false;
  }
}
