'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRole } from '@/lib/role-context';
import { ACCOUNTS, findAccountByHandle } from '@/lib/accounts';
import { login as apiLogin } from '@/lib/api-client';
import { ApiRequestError } from '@/lib/api-client';

export default function LoginPage() {
  const { setAccount } = useRole();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const typed = handle.trim();
    if (!typed) {
      setError('Enter a username.');
      return;
    }

    setBusy(true);
    try {
      // Primary path: validate username + password against MongoDB.
      const account = await apiLogin(typed, password);
      await setAccount(account.id);
      return;
    } catch (err) {
      // If the auth DB isn't reachable (not configured / API down), fall back to
      // the local handle lookup so the demo never hard-breaks.
      const code = err instanceof ApiRequestError ? err.code : 'unknown_error';
      if (code === 'auth_unavailable' || code === 'network_error') {
        const account = findAccountByHandle(typed);
        if (account) {
          await setAccount(account.id);
          return;
        }
        setError(`No account “${typed}”. Try a username below.`);
      } else if (code === 'invalid_credentials') {
        setError('Incorrect username or password.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not sign in.');
      }
    } finally {
      setBusy(false);
    }
  }

  function pickHandle(h: string) {
    setHandle(h);
    setPassword(`${h}123`);
    setError('');
  }

  const users = ACCOUNTS.filter((a) => a.kind === 'user');
  const sellers = ACCOUNTS.filter((a) => a.kind === 'seller');

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background font-sans text-foreground lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Link href="/" className="text-xl font-bold tracking-tight">
          RE<span className="text-orange">LOOP</span>
        </Link>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground/40">
            Sign in · demo
          </span>
          <h1 className="mt-3 text-4xl font-bold tracking-tighter">Welcome back.</h1>
          <p className="mt-2 text-sm text-foreground/60">
            Sign in with a demo username and password. Pick an account below to fill them in.
          </p>

          <form onSubmit={submit} className="mt-10 space-y-5">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-foreground/60">
                Username
              </label>
              <input
                autoFocus
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  setError('');
                }}
                placeholder="username"
                autoComplete="username"
                className="w-full rounded-xl border border-hairline bg-white px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-navy focus:ring-2 focus:ring-orange/20"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block font-mono text-[10px] font-bold uppercase tracking-widest text-foreground/60">
                  Password
                </label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-hairline bg-white px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-navy focus:ring-2 focus:ring-orange/20"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-navy py-3 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Continue →'}
            </button>
          </form>

          {/* Available accounts — click to fill username + password */}
          <div className="mt-8 space-y-4 text-left">
            <div>
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-orange">
                Shoppers
              </p>
              <div className="flex flex-wrap gap-2">
                {users.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pickHandle(a.handle)}
                    className="rounded-full border border-hairline px-3 py-1 font-mono text-[11px] text-foreground/60 transition-colors hover:border-navy hover:text-navy"
                  >
                    {a.handle}
                    <span className="ml-1.5 text-foreground/40">· {a.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-orange">
                Sellers
              </p>
              <div className="flex flex-wrap gap-2">
                {sellers.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pickHandle(a.handle)}
                    className="rounded-full border border-hairline px-3 py-1 font-mono text-[11px] text-foreground/60 transition-colors hover:border-navy hover:text-navy"
                  >
                    {a.handle}
                    <span className="ml-1.5 text-foreground/40">· {a.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="pt-1 font-mono text-[10px] text-foreground/40">
              Password for each demo account is the username + “123” (e.g. aarav / aarav123).
            </p>
          </div>
        </div>

        <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/40">
          © 2026 ReLoop · Operational
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="relative hidden overflow-hidden bg-navy lg:block">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-orange">
            <span className="size-1.5 animate-pulse rounded-full bg-orange" />
            Live · Seattle Cluster
          </div>

          <div>
            <h2 className="text-5xl font-bold leading-[0.95] tracking-tighter">
              Grade at the source. <br />
              <span className="text-orange">Decide before it moves.</span>
            </h2>
            <p className="mt-6 max-w-md text-white/60">
              Last 24h, ReLoop sellers recovered{' '}
              <span className="font-mono font-bold text-white">$2.4M</span> from inventory that
              would have been warehoused or written off.
            </p>

            <div className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-8">
              <BrandStat label="Couriers" value="1,204" />
              <BrandStat label="Routed 24h" value="8,491" />
              <BrandStat label="Success" value="99.8%" accent />
            </div>
          </div>

          <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            Amazon-native · SOC 2 Type II
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/40">
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl font-bold ${accent ? 'text-orange' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}
