import Link from 'next/link';

export default function ReturnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <nav className="sticky top-0 z-50 border-b border-hairline bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            RE<span className="text-orange">LOOP</span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-mono text-foreground/50">RETURN</span>
            <span className="font-mono font-medium">#RTN-88213</span>
            <Link
              href="/app/store"
              className="ml-3 rounded-full border border-hairline px-3 py-1 font-medium text-foreground/60 hover:border-navy hover:text-navy"
            >
              Exit
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
