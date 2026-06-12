'use client';

import { usePathname } from 'next/navigation';
import { StepIndicator } from '@/components/ui/step-indicator';

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
    <div>
      <div className="border-b border-navy-700 bg-navy-800">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-orange-500">
            Sell flow
          </p>
          <StepIndicator steps={steps.map((s) => s.label)} current={current} />
        </div>
      </div>
      {children}
    </div>
  );
}
