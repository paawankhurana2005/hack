// Seller-side sale records (demo, localStorage). When a listing sells we capture
// the price it landed at and what the seller earned — the data the "Sold" payoff
// screen reads to close the loop.

const KEY = 'reloop.seller.sales';

export interface SellerSale {
  id: string;
  title: string;
  soldPriceCents: number;
  originalPriceCents: number;
  sellerCredits: number;
  co2SavedKg: number;
  soldAt: string; // ISO
}

function readAll(): Record<string, SellerSale> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, SellerSale>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, SellerSale>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage blocked — session only */
  }
}

export function getSale(id: string): SellerSale | undefined {
  return readAll()[id];
}

export function recordSale(sale: SellerSale): void {
  const map = readAll();
  // First sale wins — don't overwrite a recorded sale on re-render.
  if (map[sale.id]) return;
  map[sale.id] = sale;
  writeAll(map);
}
