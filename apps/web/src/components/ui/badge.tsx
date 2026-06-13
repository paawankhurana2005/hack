import type { ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  accent: 'bg-brand/15 text-brand',
  success: 'bg-brand/15 text-brand',
  warning: 'bg-brand/15 text-brand',
  danger: 'bg-destructive/15 text-destructive',
};

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
