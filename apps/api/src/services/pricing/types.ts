// Market-estimate provider: the LLM supplies market knowledge (typical retail
// price + demand), the pricing service turns that into a recommendation.

import type { DemandLevel, SellItemDraft } from '@reloop/shared';

export interface MarketEstimate {
  /** Typical current online retail price, in INR paise (minor units). */
  estimatedRetailCents: number;
  demand: DemandLevel;
  /** One-sentence market note (product popularity / price context). */
  note: string;
}

export interface MarketEstimateInput {
  draft: SellItemDraft;
  detectedIssues: string[];
}

export interface MarketProvider {
  estimate(input: MarketEstimateInput): Promise<MarketEstimate>;
}
