import { Card } from './card';

interface StatProps {
  label: string;
  value: string;
  hint?: string;
}

export function Stat({ label, value, hint }: StatProps) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-orange-500">{hint}</p>}
    </Card>
  );
}
