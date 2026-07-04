'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SellFlowProvider } from './sell-flow-context';

const steps = [
  { href: '/sell', label: 'Intent', n: '01' },
  { href: '/sell/grading', label: 'Grading', n: '02' },
  { href: '/sell/routing', label: 'Routing', n: '03' },
  { href: '/sell/health-card', label: 'Health Card', n: '04' },
  { href: '/sell/handoff', label: 'Handoff', n: '05' },
  { href: '/sell/done', label: 'Done', n: '06' },
];

export default function SellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Longest-prefix match so nested routes resolve to the right step.
  const current = steps.reduce(
    (best, step, i) =>
      pathname === step.href || pathname.startsWith(`${step.href}/`) ? i : best,
    0,
  );

  return (
    <SellFlowProvider>
      <div className="min-h-screen bg-background font-sans text-foreground">
        <nav className="sticky top-0 z-50 border-b border-hairline bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="text-xl font-bold tracking-tight">
              RE<span className="text-orange">LOOP</span>
            </Link>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono text-foreground/50">SESSION</span>
              <span className="font-mono font-medium">#A7F-2240</span>
              <Link
                href="/app/store"
                className="ml-3 rounded-full border border-hairline px-3 py-1 font-medium text-foreground/60 hover:border-navy hover:text-navy"
              >
                Exit
              </Link>
            </div>
          </div>
          <div className="border-t border-hairline">
            <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-6 py-3">
              {steps.map((s, i) => {
                const state = i < current ? 'done' : i === current ? 'active' : 'idle';
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={`group flex min-w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors ${
                      state === 'active'
                        ? 'bg-navy text-white'
                        : state === 'done'
                          ? 'text-foreground/70 hover:bg-surface'
                          : 'text-foreground/40 hover:bg-surface'
                    }`}
                  >
                    <span className={`font-mono ${state === 'active' ? 'text-orange' : ''}`}>{s.n}</span>
                    <span className="font-medium">{s.label}</span>
                    {i < steps.length - 1 && <span className="ml-1 text-foreground/20">/</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </div>
    </SellFlowProvider>
  );
}
