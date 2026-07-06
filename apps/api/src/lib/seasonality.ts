// Seasonality index — a deterministic, calendar-driven category × month curve
// (spec 024, phase 2). Before this, PricingStateVector.seasonalityIndex was a
// named field with no seasonal logic at all: always the flat 0.5 placeholder
// in reprice-engine.ts's fillState(), and a random draw in the Python
// marketplace simulator. Unlike geoDemandIndex (spec 024, phase A), this
// signal needs no live event aggregation or database — real Indian retail
// seasonality (Diwali, wedding season, back-to-school) is well-known and
// stable enough to encode directly, so this is a pure function, always
// available even when Mongo is unconfigured.

type CategoryBucket = 'electronics' | 'fashion' | 'home' | 'toys' | 'sports' | 'books' | 'beauty' | 'other';

// PricingStateVector.category is a free-form string sourced from either the
// Sell-flow ItemCategory union (electronics/home/fashion/sports/toys/books/
// other) or the eBay/Mercari training catalogue's category strings (women/
// men/vintage & collectibles/etc, see ml/pricing's CATEGORY_BIAS) — this alias
// table normalizes both onto the same seasonal buckets.
const CATEGORY_ALIASES: Record<string, CategoryBucket> = {
  electronics: 'electronics',
  mobile: 'electronics',
  'cell phones': 'electronics',
  fashion: 'fashion',
  apparel: 'fashion',
  clothing: 'fashion',
  women: 'fashion',
  men: 'fashion',
  home: 'home',
  furniture: 'home',
  'home & garden': 'home',
  toys: 'toys',
  sports: 'sports',
  books: 'books',
  books_media: 'books',
  media: 'books',
  beauty: 'beauty',
};

function resolveCategoryBucket(category: string): CategoryBucket {
  return CATEGORY_ALIASES[category.trim().toLowerCase()] ?? 'other';
}

// One multiplier per calendar month (index 0 = January … 11 = December),
// centered on 1.0 = neutral. Same clamp range as demand_index (computeDemandIndex.ts)
// for consistency — this feature and geoDemandIndex share one scale.
const SEASONAL_CURVE: Record<CategoryBucket, readonly number[]> = {
  // Republic Day sale (Jan), Independence Day sale (Aug), Diwali (Oct/Nov).
  electronics: [1.1, 1.05, 0.95, 0.9, 0.9, 1.0, 1.05, 1.1, 1.0, 1.2, 1.25, 1.1],
  // Wedding season (Jan/Feb, Nov/Dec), Diwali (Oct/Nov).
  fashion: [1.15, 1.1, 0.95, 0.95, 1.0, 1.0, 0.9, 0.9, 0.95, 1.15, 1.2, 1.15],
  // Diwali home-refresh + wedding-season gifting.
  home: [1.0, 1.0, 0.95, 0.95, 0.95, 1.0, 1.0, 1.0, 1.0, 1.15, 1.2, 1.1],
  // Diwali + New Year gifting.
  toys: [0.95, 0.9, 0.9, 0.95, 1.0, 1.05, 1.0, 0.95, 0.95, 1.1, 1.25, 1.2],
  sports: [1.0, 1.0, 1.05, 1.05, 1.0, 0.95, 0.9, 0.9, 0.95, 1.0, 1.05, 1.05],
  // Academic-year start (Apr/Jun) bump.
  books: [1.0, 1.0, 1.05, 1.1, 1.05, 1.1, 1.0, 0.95, 1.0, 1.0, 1.0, 1.0],
  beauty: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.95, 1.0, 1.15, 1.2, 1.1],
  other: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.1, 1.05],
};

const SCORE_MIN = 0.7;
const SCORE_MAX = 1.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Deterministic seasonal demand index for a category at a given date (default
 *  now). No Mongo dependency — always real, unlike the geo-demand feature. */
export function getSeasonalityIndex(category: string, at: Date = new Date()): number {
  const bucket = resolveCategoryBucket(category);
  const raw = SEASONAL_CURVE[bucket][at.getMonth()]!;
  return clamp(raw, SCORE_MIN, SCORE_MAX);
}
