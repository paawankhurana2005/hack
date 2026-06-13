import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-2xl bg-card p-6 ring-1 ring-border ${className}`.trim()}
    >
      {children}
    </div>
  );
}
