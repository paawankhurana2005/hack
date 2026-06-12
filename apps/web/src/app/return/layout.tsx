'use client';

import { usePathname } from 'next/navigation';
import { StepIndicator } from '@/components/ui/step-indicator';

const steps = [
  { href: '/return', label: 'Reason' },
  { href: '/return/grading', label: 'Doorstep grading' },
  { href: '/return/bridge', label: 'Intelligent Bridge' },
  { href: '/return/handoff', label: 'Handoff' },
  { href: '/return/done', label: 'Done' },
];

export default function ReturnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
            Return flow
          </p>
          <StepIndicator steps={steps.map((s) => s.label)} current={current} />
        </div>
      </div>
      {children}
    </div>
  );
}
