import Link from 'next/link';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-foreground ring-1 ring-brand/50 hover:bg-brand-strong hover:shadow-[0_0_30px_rgba(234,179,8,0.25)]',
  secondary:
    'border border-border bg-transparent text-foreground hover:border-brand hover:text-brand',
};

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  /** When set (and not disabled), renders a Next.js link styled as a button. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function Button({
  children,
  variant = 'primary',
  href,
  onClick,
  disabled = false,
  className = '',
}: ButtonProps) {
  const cls = `${base} ${variants[variant]} ${className}`.trim();
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
