'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TopNav() {
  const pathname = usePathname();
  // The marketing chrome (with Log in / Get Started) only belongs on the public
  // landing page. Login is a standalone entry, and every in-app surface — the
  // user app (/app), seller dashboard (/seller), and the Return (/return) and
  // Sell (/sell) flows — carries its own dedicated nav.
  if (
    pathname === '/login' ||
    pathname.startsWith('/app') ||
    pathname.startsWith('/seller') ||
    pathname.startsWith('/return') ||
    pathname.startsWith('/sell')
  )
    return null;
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-surface/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="relative grid size-6 place-items-center rounded-full bg-brand">
            <div className="size-2.5 rounded-full border-2 border-brand-foreground" />
            <div className="absolute inset-0 rounded-full bg-brand opacity-50 blur-md transition-opacity group-hover:opacity-90" />
          </div>
          <span className="font-semibold tracking-tight text-foreground">ReLoop</span>
        </Link>
        <ul className="flex items-center gap-2 text-sm text-muted-foreground sm:gap-4">
          <li>
            <Link
              href="/login"
              className="rounded-full border border-border/80 px-4 py-1.5 font-medium text-foreground transition hover:border-brand/60 hover:text-brand active:scale-95"
            >
              Log in
            </Link>
          </li>
          <li>
            <Link
              href="/login"
              className="rounded-full bg-foreground px-4 py-1.5 font-medium text-background transition hover:opacity-90 active:scale-95"
            >
              Get Started
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
