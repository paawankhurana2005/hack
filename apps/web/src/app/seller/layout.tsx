'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/seller', label: 'Overview' },
  { href: '/seller/returns', label: 'Returns' },
  { href: '/seller/inventory', label: 'Inventory' },
  { href: '/seller/insights', label: 'Insights' },
];

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 py-10">
      <aside className="w-48 shrink-0">
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-brand">
          Seller
        </p>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => {
            const active = pathname === n.href;
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
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
