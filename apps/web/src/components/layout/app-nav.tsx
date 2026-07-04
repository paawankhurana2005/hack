'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '@/lib/role-context';

const tabs = [
  { href: '/app/store', label: 'Store' },
  { href: '/app/shop', label: 'Local Shop' },
  { href: '/app/mesh', label: 'Mesh' },
  { href: '/app/items', label: 'My Items' },
  { href: '/app/listings', label: 'My Listings' },
  { href: '/app/rewards', label: 'Rewards' },
];

/** Sub-nav for the user app — tabs + role label + log out, styled like the flow sub-bars. */
export function AppNav() {
  const pathname = usePathname();
  const { logout, account } = useRole();

  return (
    <div className="border-b border-hairline bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" aria-label="ReLoop home" className="text-lg font-bold tracking-tight text-foreground">
            RE<span className="text-orange">LOOP</span>
          </Link>
          <span className="h-5 w-px bg-hairline" />
          <nav className="flex items-center gap-6">
            {tabs.map((t) => {
            const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`font-mono text-xs uppercase tracking-widest transition-colors hover:text-brand ${
                  active ? 'text-brand' : 'text-muted-foreground'
                }`}
              >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {account && (
            <span className="hidden items-center gap-2 sm:flex">
              <span className="grid size-6 place-items-center rounded-full bg-brand/15 font-mono text-[10px] font-semibold text-brand">
                {account.initials}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {account.name}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-brand hover:text-brand"
          >
            Switch
          </button>
        </div>
      </div>
    </div>
  );
}
