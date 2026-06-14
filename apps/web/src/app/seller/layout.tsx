'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '@/lib/role-context';

const nav = [
  { href: '/seller', label: 'Overview' },
  { href: '/seller/returns', label: 'Returns' },
  { href: '/seller/listings', label: 'Listings' },
  { href: '/seller/rescue', label: 'Rescue' },
  { href: '/seller/bulk-exchange', label: 'Bulk Exchange' },
  { href: '/seller/spare-parts', label: 'Spare Parts' },
  { href: '/seller/inventory', label: 'Inventory' },
  { href: '/seller/insights', label: 'Insights' },
];

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { account, logout } = useRole();

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 py-10">
      <aside className="w-48 shrink-0">
        <Link href="/" className="mb-5 flex items-center gap-2">
          <span className="relative grid size-6 place-items-center rounded-full bg-brand">
            <span className="size-2.5 rounded-full border-2 border-brand-foreground" />
          </span>
          <span className="font-semibold tracking-tight text-foreground">ReLoop</span>
        </Link>

        <div className="mb-5 rounded-xl bg-card p-3 ring-1 ring-border">
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            Seller dashboard
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {account?.name ?? 'Seller'}
          </p>
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map((n) => {
            const active = n.href === '/seller' ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-secondary font-semibold text-brand'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={logout}
          className="mt-5 rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-brand hover:text-brand"
        >
          Switch
        </button>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
