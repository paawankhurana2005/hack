'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export type Role = 'user' | 'seller';

interface RoleValue {
  role: Role | null;
  /** False until localStorage has been read on the client (avoids hydration flash). */
  hydrated: boolean;
  setRole: (role: Role) => void;
  logout: () => void;
}

const RoleContext = createContext<RoleValue | null>(null);
const STORAGE_KEY = 'reloop.role';

/** Mock, demo-only "who am I" state. No real auth — persisted to localStorage. */
export function RoleProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRoleState] = useState<Role | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'user' || stored === 'seller') setRoleState(stored);
    setHydrated(true);
  }, []);

  const setRole = useCallback(
    (next: Role) => {
      setRoleState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      router.push(next === 'seller' ? '/seller' : '/app/items');
    },
    [router],
  );

  const logout = useCallback(() => {
    setRoleState(null);
    window.localStorage.removeItem(STORAGE_KEY);
    router.push('/login');
  }, [router]);

  return (
    <RoleContext.Provider value={{ role, hydrated, setRole, logout }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
