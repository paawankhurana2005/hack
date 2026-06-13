import type {
  ReturnGradingResult,
  ReturnHealthCard,
  ReturnReason,
  ReturnRoutingDecision,
} from '@reloop/shared';

export function mockGradeResult(reason: ReturnReason): ReturnGradingResult {
  return {
    grade: 'A',
    confidence: 0.92,
    defects: [],
    authenticityMatch: true,
    wardrobingFlag: false,
    functionallyVerifiable: true,
    rawReason: reason,
  };
}

export function mockRoutingResult(reason: ReturnReason): ReturnRoutingDecision {
  if (reason === 'arrived_damaged') {
    return {
      decision: 'recycle',
      reasoning: 'Item arrived damaged. Routing to responsible recycling.',
      co2SavedKg: 0.3,
      dwellBudgetHours: 0,
      sellerType: '1P',
      fallbackChain: [],
    };
  }
  if (reason === 'wrong_item') {
    return {
      decision: 'warehouse',
      reasoning: 'Wrong item received. Routing to warehouse for inventory reconciliation.',
      co2SavedKg: 0,
      dwellBudgetHours: 0,
      sellerType: '1P',
      fallbackChain: [],
    };
  }
  return {
    decision: 'local_resale',
    reasoning: 'Value exceeds handling cost. Local resale path selected.',
    co2SavedKg: 2.4,
    dwellBudgetHours: 48,
    sellerType: '1P',
    fallbackChain: ['donate', 'recycle'],
  };
}

export function mockHealthCard(gradingResult: ReturnGradingResult): ReturnHealthCard {
  const gradeLabel = gradingResult.grade ?? 'unknown';
  return {
    summary: `Item assessed as Grade ${gradeLabel}. ${gradingResult.defects.length === 0 ? 'No visible defects detected.' : `${gradingResult.defects.length} issue(s) noted.`}`,
    verifiedAttributes: ['Visual condition', 'Authenticity markers', 'Packaging integrity'],
    notVerified: gradingResult.functionallyVerifiable
      ? []
      : ['Functional performance', 'Electronic components'],
    trustScore: gradingResult.grade === 'A' ? 92 : gradingResult.grade === 'B' ? 75 : 55,
  };
}
