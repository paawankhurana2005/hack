// Spec 016 §Stage 7 — the Demand Graph: buyer-finding as an ADDITIVE layer on top
// of Amazon's recommendation system. Amazon already knows who searched, wishlisted,
// or bought similar items near a returned unit; this module scores that intent into
// (a) ranked buyer matches for a hub-dispatched listing and (b) the demand curve the
// Listing Agent's market context runs on. Deterministic mock — the real thing reads
// the recommendation/feature store; the scoring layer is the additive part.

import type { DemandLevel, ItemCategory } from '@reloop/shared';
import type { MatchedBuyer } from '@/lib/mocks/exchange-store';
import { getAccount } from '@/lib/accounts';

// --- Return SKU → buy-new store product (the same physical product) ------------
// Lets a doorstep-graded return surface as an "Open-box near you" option on the
// exact product page a shopper is already looking at.
export const SKU_TO_STORE_PRODUCT: Record<string, string> = {
  B09XS7JWHH: 'store_sonyxm5',
  B0AIRPODS02: 'store_airpodspro',
  B0IPADMINI6: 'store_ipadair',
  B0OPPOA5701: 'store_galaxys23',
  B0EARBUDS04: 'store_jblcharge',
  B07PQRSTUV: 'store_cooker',
};

// --- Intent signals (the mock of Amazon's recommendation graph) ----------------
// Per real demo account: which store products they recently searched, wishlisted,
// or bought similar items to — plus how far they live from the hub.
type IntentKind = MatchedBuyer['matchReason']; // 'searched' | 'wishlisted' | 'purchased_similar'

interface IntentSignal {
  productId: string;
  kind: IntentKind;
  agoDays: number;
}

const ACCOUNT_DISTANCE_KM: Record<string, number> = {
  user_aarav: 2.1,
  user_meera: 3.4,
  user_rohan: 4.8,
  user_ananya: 6.2,
};

const ACCOUNT_INTENT: Record<string, IntentSignal[]> = {
  user_aarav: [
    { productId: 'store_sonyxm5', kind: 'wishlisted', agoDays: 6 },
    { productId: 'store_airpodspro', kind: 'searched', agoDays: 2 },
    { productId: 'store_cooker', kind: 'searched', agoDays: 12 },
  ],
  user_meera: [
    { productId: 'store_galaxys23', kind: 'wishlisted', agoDays: 4 },
    { productId: 'store_jblcharge', kind: 'searched', agoDays: 9 },
  ],
  user_rohan: [
    { productId: 'store_airpodspro', kind: 'purchased_similar', agoDays: 30 },
    { productId: 'store_sonyxm5', kind: 'searched', agoDays: 3 },
    { productId: 'store_ipadair', kind: 'wishlisted', agoDays: 8 },
  ],
  user_ananya: [
    { productId: 'store_cooker', kind: 'wishlisted', agoDays: 5 },
    { productId: 'store_ipadair', kind: 'searched', agoDays: 15 },
  ],
};

const INTENT_WEIGHT: Record<IntentKind, number> = {
  purchased_similar: 0.9,
  wishlisted: 0.8,
  searched: 0.65,
};

// Synthetic locals fill the ranking below the real accounts — same city pool the
// exchange demo uses, so the two surfaces tell one story.
const SYNTHETIC_POOL: Array<
  Pick<MatchedBuyer, 'name' | 'avatar' | 'buyerId' | 'city' | 'accountAgeDays' | 'totalOrders' | 'buyerRating'>
> = [
  { name: 'Arjun Mehta', avatar: 'AM', buyerId: 'AMZ-7K2PA', city: 'Koramangala, Bengaluru', accountAgeDays: 1247, totalOrders: 847, buyerRating: 4.9 },
  { name: 'Priya Sharma', avatar: 'PS', buyerId: 'AMZ-9X3PR', city: 'Indiranagar, Bengaluru', accountAgeDays: 892, totalOrders: 312, buyerRating: 4.7 },
  { name: 'Sneha Iyer', avatar: 'SI', buyerId: 'AMZ-4B8QS', city: 'HSR Layout, Bengaluru', accountAgeDays: 2103, totalOrders: 156, buyerRating: 4.8 },
  { name: 'Kabir Nair', avatar: 'KN', buyerId: 'AMZ-2N7KX', city: 'Whitefield, Bengaluru', accountAgeDays: 380, totalOrders: 89, buyerRating: 4.6 },
  { name: 'Divya Krishnan', avatar: 'DK', buyerId: 'AMZ-6D9KR', city: 'JP Nagar, Bengaluru', accountAgeDays: 1840, totalOrders: 1204, buyerRating: 5.0 },
];

const SYNTHETIC_REASONS: IntentKind[] = ['searched', 'wishlisted', 'purchased_similar'];

function clamp01(x: number): number {
  return Math.min(0.99, Math.max(0.05, x));
}

// Deterministic per-product jitter so synthetic matches vary by product, not by render.
function productSeed(productId: string): number {
  let h = 2166136261;
  for (let i = 0; i < productId.length; i += 1) h = Math.imul(h ^ productId.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export interface MatchQuery {
  category: ItemCategory;
  priceCents: number;
  retailCents: number;
  radiusKm: number;
  sku?: string;
  storeProductId?: string;
  /** The returner/seller — never matched as their own buyer. */
  excludeAccountId?: string | null;
}

function resolveProductId(q: MatchQuery): string | undefined {
  return q.storeProductId ?? (q.sku ? SKU_TO_STORE_PRODUCT[q.sku] : undefined);
}

/**
 * Ranked buyer matches for a listing: real demo accounts with intent on this exact
 * product first, then category-level intent, then synthetic locals as fill.
 * score = intentWeight × distanceDecay × priceFit — glass-box, deterministic.
 */
export function matchBuyers(q: MatchQuery): MatchedBuyer[] {
  const productId = resolveProductId(q);
  const discount = Math.max(0, 1 - q.priceCents / Math.max(1, q.retailCents));
  const priceFit = clamp01(0.4 + discount); // deeper discount → stronger pull
  const now = Date.now();
  const out: MatchedBuyer[] = [];

  for (const [accountId, signals] of Object.entries(ACCOUNT_INTENT)) {
    if (accountId === q.excludeAccountId) continue;
    const signal = productId ? signals.find((s) => s.productId === productId) : undefined;
    if (!signal) continue;
    const distanceKm = ACCOUNT_DISTANCE_KM[accountId] ?? 5;
    if (distanceKm > q.radiusKm * 2) continue;
    const distanceDecay = Math.max(0.2, 1 - distanceKm / (q.radiusKm * 2));
    const account = getAccount(accountId);
    const name = account?.name ?? accountId;
    out.push({
      buyerId: accountId, // a REAL demo account — this buyer can actually complete the purchase
      name,
      avatar: name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      city: 'Bengaluru',
      distanceKm,
      matchReason: signal.kind,
      matchScore: Math.round(clamp01(INTENT_WEIGHT[signal.kind] * distanceDecay * priceFit) * 100) / 100,
      notifiedAt: new Date(now).toISOString(), // notified when the listing went live
      responded: false,
      totalOrders: 120,
      buyerRating: 4.8,
    });
  }

  // Synthetic fill so the panel always shows a market (min 4 candidates).
  const seed = productSeed(productId ?? q.category);
  for (let i = 0; out.length < 4 && i < SYNTHETIC_POOL.length; i += 1) {
    const b = SYNTHETIC_POOL[(i + Math.floor(seed * SYNTHETIC_POOL.length)) % SYNTHETIC_POOL.length]!;
    if (out.some((m) => m.buyerId === b.buyerId)) continue;
    const distanceKm = parseFloat((q.radiusKm * (0.3 + 0.35 * ((seed + i * 0.21) % 1))).toFixed(1));
    const kind = SYNTHETIC_REASONS[(i + Math.floor(seed * 3)) % 3]!;
    out.push({
      ...b,
      distanceKm,
      matchReason: kind,
      matchScore: Math.round(clamp01(INTENT_WEIGHT[kind] * 0.75 * priceFit) * 100) / 100,
      notifiedAt: new Date(now - (i + 1) * 4 * 60000).toISOString(),
      responded: false,
    });
  }

  return out.sort((a, b) => b.matchScore - a.matchScore);
}

export interface DemandCurve {
  nearbyBuyers: number;
  localDemand: DemandLevel;
  baseViewsPerDay: number;
  /** P(sale within k days at this price) — the curve routing + the agent share. */
  pSaleWithinDays: (k: number) => number;
}

/** The demand curve the agent's MarketContext (and glass-box screens) run on. */
export function demandCurve(q: MatchQuery): DemandCurve {
  const matches = matchBuyers(q);
  const avgScore = matches.length
    ? matches.reduce((s, m) => s + m.matchScore, 0) / matches.length
    : 0.2;
  const localDemand: DemandLevel = avgScore >= 0.55 ? 'high' : avgScore >= 0.35 ? 'medium' : 'low';
  const pDay = clamp01(0.06 + 0.4 * avgScore);
  return {
    nearbyBuyers: matches.length,
    localDemand,
    baseViewsPerDay: 4 + Math.round(6 * avgScore),
    pSaleWithinDays: (k: number) => Math.round((1 - Math.pow(1 - pDay, Math.max(0, k))) * 100) / 100,
  };
}

/** The "recommended because…" line the buyer sees on the open-box card. */
export function matchReasonLine(accountId: string | null, storeProductId: string): string | null {
  if (!accountId) return null;
  const signal = ACCOUNT_INTENT[accountId]?.find((s) => s.productId === storeProductId);
  if (!signal) return null;
  const when = signal.agoDays <= 3 ? 'this week' : signal.agoDays <= 10 ? 'last week' : 'recently';
  switch (signal.kind) {
    case 'wishlisted':
      return `Matched to you — this is on your wish list (added ${when}).`;
    case 'searched':
      return `Matched to you — you searched for this ${when}.`;
    case 'purchased_similar':
      return `Matched to you — you bought a similar item ${when}.`;
  }
}
