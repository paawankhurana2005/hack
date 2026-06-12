import Link from 'next/link';

const links = [
  { href: '/home', label: 'Home' },
  { href: '/sell', label: 'Sell' },
  { href: '/return', label: 'Return' },
  { href: '/seller', label: 'Seller' },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-10 border-b border-navy-700 bg-navy-800/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="text-white">Re</span>
          <span className="-ml-2 text-orange-500">Loop</span>
        </Link>
        <ul className="flex items-center gap-6 text-sm">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-muted transition-colors hover:text-orange-500">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
