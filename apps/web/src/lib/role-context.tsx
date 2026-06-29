'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACCOUNTS, getAccount, type Account, type AccountKind } from './accounts';
import { ACCOUNT_KEY } from './storage';
import { hydrateBounded, stopCloudSync } from './cloud-sync';

export type Role = AccountKind;

interface RoleValue {
  account: Account | null;
  accountId: string | null;
  role: Role | null;
  accounts: Account[];
  /** False until localStorage has been read on the client (avoids hydration flash). */
  hydrated: boolean;
  setAccount: (id: string) => Promise<void>;
  logout: () => void;
}

const RoleContext = createContext<RoleValue | null>(null);

/** Mock, demo-only "who am I" state. No real auth — persisted to localStorage. */
export function RoleProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(ACCOUNT_KEY);
    if (stored && getAccount(stored)) {
      setAccountId(stored);
      // Pull this account's cloud data into localStorage before revealing the
      // app, bounded so a cold API never blocks the first paint for long.
      void hydrateBounded(stored).finally(() => setHydrated(true));
    } else {
      setHydrated(true);
    }
  }, []);

  const setAccount = useCallback(
    async (id: string) => {
      const acc = getAccount(id);
      if (!acc) return;
      setAccountId(id);
      window.localStorage.setItem(ACCOUNT_KEY, id);
      // Load the account's cloud data before navigating into the app.
      await hydrateBounded(id);
      router.push(acc.kind === 'seller' ? '/seller' : '/app/items');
    },
    [router],
  );

  const logout = useCallback(() => {
    stopCloudSync();
    setAccountId(null);
    window.localStorage.removeItem(ACCOUNT_KEY);
    router.push('/login');
  }, [router]);

  const account = getAccount(accountId) ?? null;

  return (
    <RoleContext.Provider
      value={{
        account,
        accountId,
        role: account?.kind ?? null,
        accounts: ACCOUNTS,
        hydrated,
        setAccount,
        logout,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
