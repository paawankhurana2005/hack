// Event significance filter — the hybrid trigger. Most raw market events DIE here and
// never wake the pricing engine; only a meaningful change (a comp actually undercuts us,
// views sustain a drop, a dwell milestone is crossed) survives. A daily heartbeat is the
// staleness backstop. In production this is EventBridge + SQS; here it's a typed queue.

import type { DemandEvent, DemandEventType, PricingReasonCode, PricingStateVector } from '@reloop/shared';

const REASON_BY_EVENT: Record<DemandEventType, PricingReasonCode> = {
  comp_sold: 'comp_sold_nearby',
  comp_listed: 'comp_listed_cheaper',
  asin_new_price_changed: 'amazon_new_price_dropped',
  view_velocity_drop: 'view_velocity_drop',
  dwell_threshold: 'dwell_threshold',
  save_no_purchase: 'save_no_purchase',
  heartbeat: 'heartbeat_staleness',
  initial_listing: 'initial_listing',
};

export function reasonCodeFor(type: DemandEventType): PricingReasonCode {
  return REASON_BY_EVENT[type];
}

function num(payload: Record<string, unknown>, key: string, fallback = 0): number {
  const v = payload[key];
  return typeof v === 'number' ? v : fallback;
}

/** True when an event warrants a reprice. Most return false — that's the point. */
export function isSignificant(event: DemandEvent, state: PricingStateVector): boolean {
  const p = event.payload;
  switch (event.type) {
    case 'comp_sold':
      return true; // a real transaction cleared — always informative
    case 'comp_listed':
      return num(p, 'price') < state.compMedianPrice * 0.95; // undercuts us by >5%
    case 'asin_new_price_changed':
      return Math.abs((num(p, 'newPrice') - state.amazonNewPrice) / state.amazonNewPrice) > 0.08;
    case 'view_velocity_drop':
      return num(p, 'currentVelocity') < state.viewVelocity24h * 0.3; // sustained drop
    case 'dwell_threshold':
      return [3, 7, 14, 21].includes(num(p, 'daysOnMarket'));
    case 'save_no_purchase':
      return num(p, 'hoursSinceSave') > 72;
    case 'heartbeat':
      return true; // daily staleness backstop
    case 'initial_listing':
      return true; // first price
    default:
      return false;
  }
}

/** In-process significance-filtered queue (SQS stand-in). */
export class PricingEventQueue {
  private readonly queue: DemandEvent[] = [];

  enqueue(event: DemandEvent, state: PricingStateVector): boolean {
    if (isSignificant(event, state)) {
      this.queue.push(event);
      return true;
    }
    return false; // silently dropped — the key architectural move
  }

  async process(handler: (event: DemandEvent) => Promise<void>): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      if (event) await handler(event);
    }
  }

  get size(): number {
    return this.queue.length;
  }
}
