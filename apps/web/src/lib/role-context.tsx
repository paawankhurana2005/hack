'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACCOUNTS, getAccount, type Account, type AccountKind } from './accounts';
import { ACCOUNT_KEY } from './storage';

export type Role = AccountKind;

interface RoleValue {
  account: Account | null;
  accountId: string | null;
  role: Role | null;
  accounts: Account[];
  /** False until localStorage has been read on the client (avoids hydration flash). */
  hydrated: boolean;
  setAccount: (id: string) => void;
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
    if (stored && getAccount(stored)) setAccountId(stored);
    setHydrated(true);
  }, []);

  const setAccount = useCallback(
    (id: string) => {
      const acc = getAccount(id);
      if (!acc) return;
      setAccountId(id);
      window.localStorage.setItem(ACCOUNT_KEY, id);
      router.push(acc.kind === 'seller' ? '/seller' : '/app/items');
    },
    [router],
  );

  const logout = useCallback(() => {
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
