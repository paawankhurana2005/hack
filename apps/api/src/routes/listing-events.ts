// Per-listing engagement event capture route (spec 024, phase 3). Always
// fire-and-forget from the caller's perspective — logListingEvent() itself
// never throws, so this route always returns 200 (never blocks/breaks a
// buyer's page view over a logging hiccup), same ethos as demandEvents.ts.

import { Router } from 'express';
import { z } from 'zod';
import { logListingEvent } from '../services/listingEvents.js';

const eventSchema = z.object({
  eventType: z.enum(['view', 'save', 'message', 'cart_abandon']),
});

export function createListingEventsRouter(): Router {
  const router = Router();

  router.post('/:listingId/events', (req, res) => {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      res.status(400).json({ error: { code: 'invalid_request', message } });
      return;
    }
    logListingEvent(req.params.listingId, parsed.data.eventType);
    res.json({ ok: true });
  });

  return router;
}
