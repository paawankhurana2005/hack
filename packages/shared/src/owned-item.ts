// An item the user already owns — their Amazon order history, the entry point to
// selling. Carries ONLY pre-grading facts plus the original-listing reference the
// grader diffs the user's photos against. Condition is never pre-set — it is AI
// output from photos (see GradingResult).

import type { ID, Money } from './common.js';
import type { ItemId } from './provenance.js';
import type { ItemCategory } from './sell.js';

export interface OwnedItem {
  id: ID;
  /** The stable physical-item identity — the key into the item's provenance chain. */
  itemId: ItemId;
  title: string;
  category: ItemCategory;
  /** Primary listing thumbnail (a pre-grading fact, not a condition signal). */
  imageUrl: string;
  /** ISO 8601 date the item was purchased. */
  purchaseDate: string;
  originalPrice: Money;
  description: string;
  /** The product's original Amazon listing photos — reference for the grader. */
  originalListingImages: string[];
  /** Known specs from when the item was sold (model, color, …) — reference. */
  originalSpecs: Record<string, string>;
}
