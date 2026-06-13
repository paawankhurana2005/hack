'use client';

import { useRole } from '@/lib/role-context';
import { ACCOUNTS, type Account } from '@/lib/accounts';
import { Eyebrow, GridBackdrop } from '@/components/ui/section';

function AccountButton({ account, onPick }: { account: Account; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(account.id)}
      className="group rounded-2xl bg-card p-6 text-left ring-1 ring-border transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand/10 hover:ring-brand/40"
    >
      <div className="flex items-center justify-between">
        <span className="grid size-11 place-items-center rounded-full bg-brand/15 font-mono text-sm font-semibold text-brand">
          {account.initials}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {account.kind === 'seller' ? 'Pro · High-volume' : `User · ${account.city}`}
        </span>
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground">{account.name}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{account.blurb}</p>
      <span className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand py-2 pl-2 pr-4 text-sm font-medium text-brand-foreground ring-1 ring-brand/50 transition group-hover:shadow-[0_0_30px_rgba(234,179,8,0.25)]">
        <span className="grid size-6 place-items-center rounded bg-brand-foreground/10">→</span>
        Continue as {account.name.split(' ')[0]}
      </span>
    </button>
  );
}

export default function LoginPage() {
  const { setAccount } = useRole();
  const users = ACCOUNTS.filter((a) => a.kind === 'user');
  const sellers = ACCOUNTS.filter((a) => a.kind === 'seller');

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface px-6 py-20">
      <GridBackdrop />
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-[140px]" />
      </div>

      <div className="relative w-full max-w-3xl text-center">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="relative grid size-7 place-items-center rounded-full bg-brand">
            <div className="size-3 rounded-full border-2 border-brand-foreground" />
            <div className="absolute inset-0 rounded-full bg-brand opacity-50 blur-md" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">ReLoop</span>
        </div>

        <Eyebrow className="mb-4">Select identity · demo</Eyebrow>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Continue as…
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-muted-foreground">
          No password needed — this is a demo. Pick who you are. Switch any time from the top bar.
        </p>

        {/* Users */}
        <div className="mt-10 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-brand">Shoppers</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {users.map((a) => (
            <AccountButton key={a.id} account={a} onPick={setAccount} />
          ))}
        </div>

        {/* Seller */}
        <div className="mt-10 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-brand">Seller</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {sellers.map((a) => (
            <AccountButton key={a.id} account={a} onPick={setAccount} />
          ))}
        </div>
      </div>
    </div>
  );
}
