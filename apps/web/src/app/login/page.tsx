'use client';

import { useState } from 'react';
import { useRole } from '@/lib/role-context';
import { ACCOUNTS, findAccountByHandle } from '@/lib/accounts';
import { login as apiLogin } from '@/lib/api-client';
import { ApiRequestError } from '@/lib/api-client';
import { Eyebrow, GridBackdrop } from '@/components/ui/section';

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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface px-6 py-20">
      <GridBackdrop />
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-[140px]" />
      </div>

      <div className="relative w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="relative grid size-7 place-items-center rounded-full bg-brand">
            <div className="size-3 rounded-full border-2 border-brand-foreground" />
            <div className="absolute inset-0 rounded-full bg-brand opacity-50 blur-md" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">ReLoop</span>
        </div>

        <Eyebrow className="mb-4">Sign in · demo</Eyebrow>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Who are you?
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-pretty text-muted-foreground">
          Sign in with a demo username and password. Pick an account below to fill them in.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-card p-2 ring-1 ring-border focus-within:ring-brand/50">
            <span className="pl-2 font-mono text-sm text-muted-foreground">@</span>
            <input
              autoFocus
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setError('');
              }}
              placeholder="username"
              autoComplete="username"
              className="flex-1 bg-transparent py-2 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-card p-2 ring-1 ring-border focus-within:ring-brand/50">
            <span className="pl-2 font-mono text-sm text-muted-foreground">·</span>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="password"
              autoComplete="current-password"
              className="flex-1 bg-transparent py-2 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand py-2 pl-2 pr-4 text-sm font-medium text-brand-foreground ring-1 ring-brand/50 transition hover:shadow-[0_0_30px_rgba(234,179,8,0.25)] active:scale-95 disabled:opacity-60"
            >
              <span className="grid size-6 place-items-center rounded bg-brand-foreground/10">→</span>
              {busy ? 'Signing in…' : 'Enter'}
            </button>
          </div>
          {error && <p className="text-left text-xs text-destructive">{error}</p>}
        </form>

        {/* Available accounts — click to fill username + password */}
        <div className="mt-8 space-y-3 text-left">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-brand">Shoppers</p>
            <div className="flex flex-wrap gap-2">
              {users.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickHandle(a.handle)}
                  className="rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-brand hover:text-brand"
                >
                  {a.handle}
                  <span className="ml-1.5 text-muted-foreground/50">· {a.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-brand">Sellers</p>
            <div className="flex flex-wrap gap-2">
              {sellers.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickHandle(a.handle)}
                  className="rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-brand hover:text-brand"
                >
                  {a.handle}
                  <span className="ml-1.5 text-muted-foreground/50">· {a.name}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="pt-1 font-mono text-[10px] text-muted-foreground/60">
            Password for each demo account is the username + “123” (e.g. aarav / aarav123).
          </p>
        </div>
      </div>
    </div>
  );
}
