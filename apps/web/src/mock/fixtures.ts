// MOCK DATA ONLY — not real. Used to render placeholder screens during the
// scaffold phase. Typed against @reloop/shared so the contracts stay honest.

import type {
  GradingResult,
  ProductHealthCard,
  RoutingDecision,
} from '@reloop/shared';

export const mockGrading: GradingResult = {
  id: 'grade_001',
  productId: 'prod_001',
  grade: 'good',
  confidence: 0.86,
  detectedIssues: ['Light scuff on bottom-left corner', 'Minor screen dust'],
  summary: 'Lightly used with minor cosmetic wear; fully functional.',
  photoUrls: [],
  gradedAt: '2026-06-12T10:00:00.000Z',
};

export const mockRouting: RoutingDecision = {
  id: 'route_001',
  productId: 'prod_001',
  chosenPath: 'local-resale',
  rationale:
    'Strong nearby demand and high resale value relative to handling cost make a local resale the best path — it also avoids a warehouse round-trip.',
  factors: [
    { label: 'Nearby demand', value: 'High', weight: 0.4 },
    { label: 'Resale value', value: '$48', weight: 0.3 },
    { label: 'Local handling cost', value: 'Low', weight: 0.2 },
    { label: 'Carbon impact', value: 'Saves 1.8kg', weight: 0.1 },
  ],
  estimatedValue: { amountCents: 4800, currency: 'USD' },
  carbonSavedKg: 1.8,
  decidedAt: '2026-06-12T10:01:00.000Z',
};

export const mockHealthCard: ProductHealthCard = {
  id: 'card_001',
  productId: 'prod_001',
  title: 'Wireless Noise-Cancelling Headphones',
  grade: 'good',
  confidence: 0.86,
  summary: 'Lightly used, fully functional, with minor cosmetic wear.',
  detectedIssues: ['Light scuff on bottom-left corner', 'Minor screen dust'],
  authenticityVerified: true,
  listingPrice: { amountCents: 4800, currency: 'USD' },
  history: [
    { label: 'Graded', at: '2026-06-12T10:00:00.000Z' },
    { label: 'Verified authentic', at: '2026-06-12T10:00:30.000Z' },
  ],
  healthCardUrl: 'https://reloop.example/card/card_001',
  issuedAt: '2026-06-12T10:01:00.000Z',
};
