import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/** Standard placeholder page wrapper: title + one-line description + body. */
export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}
