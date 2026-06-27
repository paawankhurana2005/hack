// EcoCredits ledger (demo, localStorage) — PER USER. Buyer earns come from the
// signed-in user's recorded Shop purchases; seller earns + voucher redemptions
// live in this user's ledger. Balance = total earned − total redeemed. Vouchers
// are display-only (no real money).

import { getPurchases } from './marketplace-store';
import { nsKey, readJson, writeJson } from './storage';

const LEDGER_BASE = 'credits.ledger';

export interface CreditEntry {
  kind: 'earn' | 'redeem';
  amount: number; // EcoCredits
  label: string;
  at: string; // ISO
  code?: string; // voucher code (redeem only)
  key?: string; // idempotency key — a retry/re-fire with the same key is ignored
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

function readLedger(accountId?: string): CreditEntry[] {
  return readJson<CreditEntry[]>(nsKey(LEDGER_BASE, accountId), []);
}

function writeLedger(entries: CreditEntry[], accountId?: string): void {
  writeJson(nsKey(LEDGER_BASE, accountId), entries);
}

/** All credit events for the signed-in user (buyer earns from purchases + seller
 *  earns + redemptions), newest first. */
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

/** Credit the signed-in user (e.g. for listing an item). `key` makes it idempotent. */
export function earnSeller(amount: number, label: string, key?: string): void {
  earnFor(undefined, amount, label, key);
}

/** Credit a SPECIFIC account — used when one user's purchase pays another user.
 *  When `key` is supplied, a repeat earn with the same key is ignored (so a retry or
 *  cold-start re-fire never double-credits). */
export function earnFor(
  accountId: string | undefined,
  amount: number,
  label: string,
  key?: string,
): void {
  if (amount <= 0) return;
  const ledger = readLedger(accountId);
  if (key && ledger.some((e) => e.key === key)) return; // idempotent: already credited
  writeLedger(
    [{ kind: 'earn', amount, label, at: new Date().toISOString(), ...(key ? { key } : {}) }, ...ledger],
    accountId,
  );
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
