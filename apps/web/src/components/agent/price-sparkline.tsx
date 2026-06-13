'use client';

interface Props {
  history: { day: number; cents: number }[];
  floorCents: number;
}

/** Tiny inline price trend for listing cards. */
export function PriceSparkline({ history, floorCents }: Props) {
  if (history.length < 2) return null;
  const w = 96;
  const h = 28;
  const vals = history.map((p) => p.cents);
  const hi = Math.max(...vals);
  const lo = Math.min(floorCents, ...vals);
  const span = Math.max(1, hi - lo);
  const x = (i: number) => (i / (history.length - 1)) * w;
  const y = (c: number) => h - ((c - lo) / span) * h;
  const d = history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.cents)}`).join(' ');
  const floorY = y(floorCents);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24" aria-hidden>
      <line x1={0} y1={floorY} x2={w} y2={floorY} stroke="oklch(var(--brand))" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="oklch(var(--brand))" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}
