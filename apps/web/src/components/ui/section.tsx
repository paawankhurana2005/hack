import type { ReactNode } from 'react';

/** Mono uppercase brand label used above headings — the landing "Pillar 0X /" treatment. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`block font-mono text-xs uppercase tracking-widest text-brand ${className}`.trim()}
    >
      {children}
    </span>
  );
}

/** Tiny mono micro-label (table keys, captions). */
export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-widest text-muted-foreground ${className}`.trim()}
    >
      {children}
    </span>
  );
}

interface PanelProps {
  /** When set, renders the terminal "window chrome" header with this session label. */
  label?: string;
  /** Right-aligned status text in the chrome header. */
  status?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** A ring-bordered card. With `label`, gains the landing's terminal/trace window chrome. */
export function Panel({ label, status, children, className = '', bodyClassName = 'p-6' }: PanelProps) {
  return (
    <div className={`rounded-2xl bg-card ring-1 ring-border ${className}`.trim()}>
      {label && (
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            <span className="size-2 rounded-full bg-brand/80" />
          </div>
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground">{label}</div>
          <div className="font-mono text-[10px] text-brand">{status ?? 'LIVE ●'}</div>
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** Faint dotted grid + radial mask — the landing hero backdrop, for page headers. */
export function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.15]"
      style={{
        backgroundImage:
          'linear-gradient(to right, color-mix(in oklab, oklch(var(--foreground)) 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, oklch(var(--foreground)) 8%, transparent) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse at top, black 30%, transparent 75%)',
      }}
    />
  );
}
