import type { ReactNode } from 'react';
import { Eyebrow, GridBackdrop } from '@/components/ui/section';

interface PageShellProps {
  title: string;
  description?: string;
  /** Optional mono brand eyebrow above the title. */
  eyebrow?: string;
  children?: ReactNode;
}

/** Standard page wrapper: mono eyebrow + title + one-line description + body. */
export function PageShell({ title, description, eyebrow, children }: PageShellProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 pt-12">
      <div className="relative">
        <GridBackdrop />
        <div className="relative">
          {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="mt-10">{children}</div>
    </section>
  );
}
