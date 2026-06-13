// Shop — the buy side. A second-life item listed by one user is a buyable item in
// another's Shop. Each item wears its Product Health Card (the trust layer), which
// is what makes buying second-life feel safe vs a generic classified.

import type { ID, Money } from './common.js';
import type { ProductHealthCard } from './health-card.js';
import type { ImpactEstimate } from './impact.js';
import type { ItemCategory } from './sell.js';

export interface ShopItem {
  id: ID;
  category: ItemCategory;
  imageUrl: string;
  /** Display name of the seller (mock — "You" for the user's own listings). */
  sellerName: string;
  /** Original new retail price, for discount-vs-original. */
  originalPrice: Money;
  /** Current asking price (also on the card; required here for the buy side). */
  listingPrice: Money;
  /** The trust layer — reused verbatim in the Shop card + detail view. */
  card: ProductHealthCard;
  /** Seller-side impact (CO₂ diverted + seller EcoCredits). */
  impact: ImpactEstimate;
}
