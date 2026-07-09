'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '@/lib/role-context';
import { NotificationBell } from '@/components/seller/notification-bell';

const tabs = [
  { href: '/app/shop', label: 'Local Shop' },
  { href: '/app/shop/returned', label: 'Open Box' },
  { href: '/app/items', label: 'My Items' },
  { href: '/app/rewards', label: 'Rewards' },
];

/** Sub-nav for the user app — tabs + role label + log out, styled like the flow sub-bars. */
export function AppNav() {
  const pathname = usePathname();
  const { logout, account } = useRole();
  // Longest-href-wins so a nested tab (Open Box under Local Shop) doesn't
  // also light up its parent.
  const activeHref = tabs
    .filter((o) => pathname === o.href || pathname.startsWith(`${o.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    // `backdrop-blur` creates a stacking context, so the notification dropdown's
    // own z-50 is trapped inside this header. Without a z-index here the header
    // paints under the page content and the dropdown becomes unclickable.
    <div className="relative z-50 border-b border-hairline bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" aria-label="ReLoop home" className="text-lg font-bold tracking-tight text-foreground">
            RE<span className="text-orange">LOOP</span>
          </Link>
          <span className="h-5 w-px bg-hairline" />
          <nav className="flex items-center gap-6">
            {tabs.map((t) => {
            const active = activeHref === t.href;
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
          {/* Spec 024, phase 6: the same real notification inbox sellers get —
              this account is a real platform user, and buyer-matching events
              (a local buyer being notified/matched) now target it too. */}
          <NotificationBell sellerId={account?.id ?? ''} />
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
