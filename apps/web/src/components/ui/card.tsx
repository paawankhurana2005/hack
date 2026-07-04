import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-2xl bg-card p-6 ring-1 ring-hairline shadow-[0_1px_2px_rgba(35,47,62,0.04)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}
