// Significance filter lives in @reloop/shared now (so the web simulator and the API agree
// exactly). This module re-exports it and adds the in-process queue (the SQS stand-in).

import type { DemandEvent, PricingStateVector } from '@reloop/shared';
import { isSignificant } from '@reloop/shared';

export { isSignificant, reasonCodeFor } from '@reloop/shared';

/** In-process significance-filtered queue (SQS stand-in for local/dev). */
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
