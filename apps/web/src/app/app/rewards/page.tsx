'use client';

import { useEffect, useState } from 'react';
import type { Money } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GridBackdrop } from '@/components/ui/section';
import { formatMoney } from '@/lib/money';
import {
  getActivity,
  getBalance,
  getVouchers,
  redeemVoucher,
  VOUCHER_TIERS,
  type CreditEntry,
  type VoucherTier,
} from '@/lib/credits-store';

const inr = (paise: number): Money => ({ amountCents: paise, currency: 'INR' });

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function RewardsPage() {
  const [balance, setBalance] = useState(0);
  const [activity, setActivity] = useState<CreditEntry[]>([]);
  const [vouchers, setVouchers] = useState<CreditEntry[]>([]);
  const [justRedeemed, setJustRedeemed] = useState<{ code: string; value: number } | null>(null);

  function refresh() {
    setBalance(getBalance());
    setActivity(getActivity());
    setVouchers(getVouchers());
  }

  useEffect(refresh, []);

  function redeem(tier: VoucherTier) {
    const code = redeemVoucher(tier);
    if (!code) return;
    setJustRedeemed({ code, value: tier.valuePaise });
    refresh();
  }

  // Next tier the user can't afford yet — drives the progress bar.
  const nextTier = VOUCHER_TIERS.find((t) => t.credits > balance);
  const progressTarget = nextTier ?? VOUCHER_TIERS[VOUCHER_TIERS.length - 1]!;
  const progressPct = Math.min(100, Math.round((balance / progressTarget.credits) * 100));

  return (
    <PageShell
      eyebrow="Rewards · EcoCredits"
      title="Your impact, rewarded"
      description="Earn EcoCredits every time you sell or buy second-life. Redeem them as Amazon vouchers — proof that keeping things in the loop pays off."
    >
      {/* Balance hero */}
      <div className="relative overflow-hidden rounded-3xl bg-card p-8 ring-1 ring-border">
        <GridBackdrop />
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-brand/10 blur-[120px]" />
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            EcoCredits balance
          </p>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-7xl font-semibold tracking-tighter tabular-nums text-brand [text-shadow:0_0_40px_rgba(234,179,8,0.35)]">
              {balance}
            </span>
            <span className="pb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              credits
            </span>
          </div>

          {/* Progress to next tier */}
          <div className="mt-6 max-w-md">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>
                {nextTier
                  ? `${nextTier.credits - balance} more → ${formatMoney(inr(nextTier.valuePaise))} voucher`
                  : 'Top tier unlocked'}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-brand shadow-[0_0_16px_oklch(var(--brand))] transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <p className="relative mt-4 max-w-md text-[11px] text-muted-foreground">
            Avoided emissions, estimated from category + routing data, counted toward Amazon&apos;s
            Climate Pledge — not a traded carbon credit.
          </p>
        </div>
      </div>

      {/* Just-redeemed banner */}
      {justRedeemed && (
        <Card className="mt-6 ring-brand/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-sm text-brand">
                ✓
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                  Voucher unlocked
                </p>
                <p className="text-sm text-foreground">
                  {formatMoney(inr(justRedeemed.value))} Amazon voucher is yours.
                </p>
              </div>
            </div>
            <span className="rounded-lg border border-dashed border-brand/50 bg-brand/10 px-4 py-2 font-mono text-sm tracking-widest text-brand">
              {justRedeemed.code}
            </span>
          </div>
        </Card>
      )}

      {/* Voucher tiers */}
      <h2 className="mt-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Redeem for vouchers
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {VOUCHER_TIERS.map((tier) => {
          const affordable = balance >= tier.credits;
          return (
            <div
              key={tier.credits}
              className={`flex flex-col rounded-2xl bg-card p-5 ring-1 transition-all ${
                affordable
                  ? 'bg-gradient-to-b from-brand/10 to-card ring-brand/40'
                  : 'ring-border opacity-80'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {tier.credits} credits
                </span>
                {affordable && (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-brand">
                    Ready
                  </span>
                )}
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-brand">
                {formatMoney(inr(tier.valuePaise))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Amazon voucher</p>
              <div className="mt-4 flex-1" />
              {affordable ? (
                <Button variant="primary" className="w-full" onClick={() => redeem(tier)}>
                  Redeem
                </Button>
              ) : (
                <div className="rounded-lg border border-border px-4 py-2.5 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {tier.credits - balance} more needed
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* My vouchers + activity */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Your vouchers</p>
          {vouchers.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No vouchers yet — redeem credits above to unlock one.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {vouchers.map((v) => (
                <li
                  key={v.code}
                  className="flex items-center justify-between rounded-lg bg-surface px-3 py-2"
                >
                  <span className="font-mono text-sm tracking-widest text-brand">{v.code}</span>
                  <span className="text-sm text-foreground">{v.label.replace(' Amazon voucher', '')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Activity</p>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Sell or buy a second-life item to start earning.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activity.slice(0, 6).map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="flex items-center justify-between border-b border-border/40 py-1.5 text-sm"
                >
                  <span className="text-muted-foreground">{e.label}</span>
                  <span className="flex items-center gap-3">
                    <span className={`font-mono ${e.kind === 'earn' ? 'text-brand' : 'text-muted-foreground'}`}>
                      {e.kind === 'earn' ? '+' : '−'}
                      {e.amount}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {when(e.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
