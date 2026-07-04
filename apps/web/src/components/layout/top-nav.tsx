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
    <header className="sticky top-0 z-50 border-b border-hairline bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
          RE<span className="text-orange">LOOP</span>
        </Link>
        <ul className="flex items-center gap-3 text-sm">
          <li>
            <Link
              href="/login"
              className="rounded-full border border-navy px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:bg-navy hover:text-white active:scale-95"
            >
              Login
            </Link>
          </li>
          <li>
            <Link
              href="/sell"
              className="rounded-full bg-orange px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-orange-hover active:scale-95"
            >
              Get Started
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
