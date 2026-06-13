'use client';

import { formatMoney } from '@/lib/money';

const inr = (cents: number) => ({ amountCents: cents, currency: 'INR' as const });

interface Point {
  day: number;
  cents: number;
}

interface Props {
  history: Point[];
  floorCents: number;
  retailCents: number;
  currentDay: number;
  currentPriceCents: number;
}

const W = 640;
const H = 220;
const PAD = { top: 24, right: 64, bottom: 28, left: 16 };

/** Stepped price-over-time chart with the floor drawn as a rail the line never
 *  crosses — the visual proof of "free within the rails". */
export function PriceHistoryChart({
  history,
  floorCents,
  retailCents,
  currentDay,
  currentPriceCents,
}: Props) {
  // Extend the line to "today" at the current price so a held day still shows.
  const pts: Point[] = [...history];
  const last = pts[pts.length - 1];
  if (last && last.day < currentDay) pts.push({ day: currentDay, cents: currentPriceCents });

  const maxDay = Math.max(currentDay, ...pts.map((p) => p.day), 1);
  const hi = Math.max(retailCents, ...pts.map((p) => p.cents));
  const lo = Math.min(floorCents, ...pts.map((p) => p.cents));
  const span = Math.max(1, hi - lo);

  const x = (d: number) => PAD.left + (d / maxDay) * (W - PAD.left - PAD.right);
  const y = (c: number) => PAD.top + (1 - (c - lo) / span) * (H - PAD.top - PAD.bottom);

  // Stepped path: hold horizontally to the next day, then drop vertically.
  let d = `M ${x(pts[0]!.day)} ${y(pts[0]!.cents)}`;
  for (let i = 1; i < pts.length; i += 1) {
    d += ` L ${x(pts[i]!.day)} ${y(pts[i - 1]!.cents)} L ${x(pts[i]!.day)} ${y(pts[i]!.cents)}`;
  }

  const floorY = y(floorCents);
  const startCents = pts[0]!.cents;
  const dropPct = Math.round(((startCents - currentPriceCents) / startCents) * 100);

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Price history</p>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {dropPct > 0 ? `↓ ${dropPct}% over ${currentDay}d` : `Day ${currentDay}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Price history">
        {/* floor rail */}
        <line
          x1={PAD.left}
          y1={floorY}
          x2={W - PAD.right}
          y2={floorY}
          stroke="oklch(var(--brand))"
          strokeOpacity={0.45}
          strokeWidth={1.5}
          strokeDasharray="5 5"
        />
        <text
          x={W - PAD.right + 8}
          y={floorY + 4}
          className="fill-brand font-mono"
          fontSize={11}
          opacity={0.8}
        >
          floor
        </text>
        <text x={W - PAD.right + 8} y={floorY + 18} className="fill-muted-foreground font-mono" fontSize={10}>
          {formatMoney(inr(floorCents))}
        </text>

        {/* price line */}
        <path d={d} fill="none" stroke="oklch(var(--brand))" strokeWidth={2.5} strokeLinejoin="round" />

        {/* points */}
        {pts.map((p, i) => (
          <circle
            key={`${p.day}-${i}`}
            cx={x(p.day)}
            cy={y(p.cents)}
            r={i === pts.length - 1 ? 5 : 3}
            className="fill-brand"
          />
        ))}

        {/* current price label */}
        <text
          x={x(pts[pts.length - 1]!.day)}
          y={y(currentPriceCents) - 12}
          textAnchor="end"
          className="fill-foreground font-mono"
          fontSize={13}
          fontWeight={600}
        >
          {formatMoney(inr(currentPriceCents))}
        </text>
      </svg>
    </div>
  );
}
