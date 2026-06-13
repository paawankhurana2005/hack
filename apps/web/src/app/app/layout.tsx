'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/lib/role-context';
import { AppNav } from '@/components/layout/app-nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, hydrated } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !role) router.replace('/login');
  }, [hydrated, role, router]);

  // Avoid a flash of app chrome before we know the role / while redirecting.
  if (!hydrated || !role) return null;

  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
