import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-navy-600 bg-navy-800 p-6 shadow-sm ${className}`.trim()}
    >
      {children}
    </div>
  );
}
