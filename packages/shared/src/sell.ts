// Sell-flow contracts. Types only — single source of truth in @reloop/shared.

export type ItemCategory =
  | 'electronics'
  | 'home'
  | 'fashion'
  | 'sports'
  | 'toys'
  | 'books'
  | 'other';

/** What the user provides on the Sell entry screen. */
export interface SellItemDraft {
  title: string;
  category: ItemCategory;
  notes?: string;
}

/**
 * Request body for POST /api/sell/grade.
 * Images are base64-encoded JPEGs WITHOUT the `data:` URL prefix.
 */
export interface GradeRequest {
  draft: SellItemDraft;
  imagesBase64: string[];
}

/** Standard API error envelope returned by apps/api on failure. */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
