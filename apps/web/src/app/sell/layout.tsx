'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { StepIndicator } from '@/components/ui/step-indicator';
import { SellFlowProvider } from './sell-flow-context';

const steps = [
  { href: '/sell', label: 'Intent' },
  { href: '/sell/grading', label: 'Grading' },
  { href: '/sell/routing', label: 'Routing' },
  { href: '/sell/health-card', label: 'Health Card' },
  { href: '/sell/handoff', label: 'Handoff' },
  { href: '/sell/done', label: 'Done' },
];

export default function SellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Longest-prefix match so nested routes resolve to the right step.
  const current = steps.reduce(
    (best, step, i) =>
      pathname === step.href || pathname.startsWith(`${step.href}/`)
        ? i
        : best,
    0,
  );

  return (
    <SellFlowProvider>
      <div className="border-b border-border/60 bg-card/30 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="mb-3 flex items-center gap-4">
            <Link href="/" aria-label="ReLoop home" className="group flex items-center gap-2.5">
              <div className="relative grid size-6 place-items-center rounded-full bg-brand">
                <div className="size-2.5 rounded-full border-2 border-brand-foreground" />
                <div className="absolute inset-0 rounded-full bg-brand opacity-50 blur-md transition-opacity group-hover:opacity-90" />
              </div>
              <span className="hidden font-semibold tracking-tight text-foreground sm:inline">
                ReLoop
              </span>
            </Link>
            <span className="h-5 w-px bg-border/60" />
            <p className="font-mono text-xs uppercase tracking-widest text-brand">Sell flow</p>
          </div>
          <StepIndicator steps={steps.map((s) => s.label)} current={current} />
        </div>
      </div>
      {children}
    </SellFlowProvider>
  );
}
