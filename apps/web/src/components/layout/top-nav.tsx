'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/app/items', label: 'Home' },
  { href: '/sell', label: 'Sell' },
  { href: '/return', label: 'Return' },
  { href: '/seller', label: 'Seller' },
];

export function TopNav() {
  const pathname = usePathname();
  // The entity-select page is a standalone full-screen entry — no global chrome.
  if (pathname === '/login') return null;
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-surface/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="relative grid size-6 place-items-center rounded-full bg-brand">
            <div className="size-2.5 rounded-full border-2 border-brand-foreground" />
            <div className="absolute inset-0 rounded-full bg-brand opacity-50 blur-md transition-opacity group-hover:opacity-90" />
          </div>
          <span className="font-semibold tracking-tight text-foreground">ReLoop</span>
          <span className="ml-1 rounded-full border border-border/80 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            v0.4
          </span>
        </Link>
        <ul className="flex items-center gap-6 text-sm text-muted-foreground">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`transition-colors hover:text-brand ${active ? 'text-brand' : ''}`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
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
