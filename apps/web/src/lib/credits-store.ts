// EcoCredits ledger (demo, localStorage). Buyer earns come from recorded Shop
// purchases; seller earns and voucher redemptions live in this ledger. Balance =
// total earned − total redeemed. Vouchers are display-only (no real money).

import { getPurchases } from './marketplace-store';

const LEDGER_KEY = 'reloop.credits.ledger';

export interface CreditEntry {
  kind: 'earn' | 'redeem';
  amount: number; // EcoCredits
  label: string;
  at: string; // ISO
  code?: string; // voucher code (redeem only)
}

export interface VoucherTier {
  credits: number;
  valuePaise: number;
}

// Escalating value: the more you keep in the loop, the better the conversion.
export const VOUCHER_TIERS: VoucherTier[] = [
  { credits: 25, valuePaise: 2500 }, // ₹25
  { credits: 75, valuePaise: 9000 }, // ₹90
  { credits: 150, valuePaise: 20000 }, // ₹200
  { credits: 300, valuePaise: 45000 }, // ₹450
];

function readLedger(): CreditEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as CreditEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLedger(entries: CreditEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(entries));
  } catch {
    /* storage blocked — session-only */
  }
}

/** All credit events (buyer earns from purchases + seller earns + redemptions), newest first. */
export function getActivity(): CreditEntry[] {
  const buyerEarns: CreditEntry[] = getPurchases().map((p) => ({
    kind: 'earn',
    amount: p.buyerCredits,
    label: `Bought ${p.title}`,
    at: p.at,
  }));
  return [...buyerEarns, ...readLedger()].sort((a, b) => b.at.localeCompare(a.at));
}

export function getBalance(): number {
  return getActivity().reduce((b, e) => (e.kind === 'earn' ? b + e.amount : b - e.amount), 0);
}

export function earnSeller(amount: number, label: string): void {
  if (amount <= 0) return;
  writeLedger([{ kind: 'earn', amount, label, at: new Date().toISOString() }, ...readLedger()]);
}

/** Redeem a tier if affordable; returns the voucher code or null. */
export function redeemVoucher(tier: VoucherTier): string | null {
  if (getBalance() < tier.credits) return null;
  const code = `RELOOP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  writeLedger([
    {
      kind: 'redeem',
      amount: tier.credits,
      label: `₹${(tier.valuePaise / 100).toLocaleString('en-IN')} Amazon voucher`,
      at: new Date().toISOString(),
      code,
    },
    ...readLedger(),
  ]);
  return code;
}

export function getVouchers(): CreditEntry[] {
  return readLedger().filter((e) => e.kind === 'redeem');
}
