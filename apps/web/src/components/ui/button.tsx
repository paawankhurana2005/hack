import Link from 'next/link';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-navy-900 disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-orange-500 text-navy-900 hover:bg-orange-600 hover:text-white',
  secondary:
    'border border-navy-600 bg-transparent text-white hover:border-orange-500 hover:text-orange-500',
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
