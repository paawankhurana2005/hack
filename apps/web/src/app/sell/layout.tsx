'use client';

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
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-brand">Sell flow</p>
          <StepIndicator steps={steps.map((s) => s.label)} current={current} />
        </div>
      </div>
      {children}
    </SellFlowProvider>
  );
}
