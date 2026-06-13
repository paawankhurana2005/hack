import { Card } from './card';

interface StatProps {
  label: string;
  value: string;
  hint?: string;
}

export function Stat({ label, value, hint }: StatProps) {
  return (
    <Card>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-brand">{hint}</p>}
    </Card>
  );
}
