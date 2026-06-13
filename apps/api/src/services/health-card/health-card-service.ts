// Builds the Product Health Card — "the trust layer". Pure assembly from the
// grade + price we already have (no external call), so it's instant and reliable.

import { randomUUID } from 'node:crypto';
import type {
  HealthCardEvent,
  HealthCardRequest,
  ProductHealthCard,
} from '@reloop/shared';

// A model/serial number (≥4 consecutive digits) is treated as an authenticity
// signal — e.g. the "392434-01" read off a shoe's size label.
const MODEL_CODE = /\b[A-Za-z-]*\d{4,}[A-Za-z0-9-]*\b/;

function hasModelCode(...parts: (string | undefined)[]): boolean {
  return parts.some((p) => p != null && MODEL_CODE.test(p));
}

export class HealthCardService {
  build(req: HealthCardRequest): ProductHealthCard {
    const { draft, grading, pricing } = req;
    const issuedAt = new Date().toISOString();
    const authenticityVerified = hasModelCode(draft.title, draft.notes);

    const history: HealthCardEvent[] = [
      { label: 'Graded', at: grading.gradedAt },
      { label: 'Priced', at: pricing.pricedAt },
    ];
    if (authenticityVerified) {
      history.push({ label: 'Verified by model number', at: issuedAt });
    }
    history.push({ label: 'Health Card issued', at: issuedAt });

    const id = `card_${randomUUID()}`;
    return {
      id,
      productId: grading.productId,
      title: draft.title,
      grade: grading.grade,
      confidence: grading.confidence,
      summary: grading.summary,
      detectedIssues: grading.detectedIssues,
      authenticityVerified,
      listingPrice: pricing.suggestedPrice,
      history,
      healthCardUrl: `https://reloop.example/card/${id}`,
      issuedAt,
    };
  }
}
