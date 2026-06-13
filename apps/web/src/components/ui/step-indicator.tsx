interface StepIndicatorProps {
  steps: string[];
  /** Zero-based index of the active step. */
  current: number;
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {steps.map((label, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const circle = isActive
          ? 'bg-brand text-brand-foreground'
          : isDone
            ? 'bg-secondary text-foreground'
            : 'bg-card text-muted-foreground border border-border';
        const text = isActive ? 'text-foreground font-semibold' : 'text-muted-foreground';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${circle}`}
            >
              {i + 1}
            </span>
            <span className={text}>{label}</span>
            {i < steps.length - 1 && <span className="mx-1 text-border">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
