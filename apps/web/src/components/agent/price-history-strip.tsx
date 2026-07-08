// Spec 026 UI redesign — extracted from local-listings/page.tsx's inline
// price-history chip strip and given an explicit floor marker, so "price
// never crosses the floor" (already guaranteed by the reprice engine's
// guardrails) is visually obvious, not just a number in the header text.

function inr(cents: number): string {
  return `₹${Math.round(cents / 100).toLocaleString('en-IN')}`;
}

export function PriceHistoryStrip({
  history,
  floorCents,
}: {
  history: { day: number; cents: number }[];
  floorCents: number;
}) {
  // "At the floor" — small epsilon for rounding, not a meaningful price gap.
  const atFloor = (cents: number) => cents <= floorCents + 100;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {history.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums ${
                atFloor(p.cents)
                  ? 'bg-warning/15 text-warning ring-1 ring-warning/30'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              d{p.day} {inr(p.cents)}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-dashed border-warning/40 pt-1.5">
        <span className="size-1.5 shrink-0 rounded-full bg-warning" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Floor {inr(floorCents)} — the agent never prices below this line
        </span>
      </div>
    </div>
  );
}
