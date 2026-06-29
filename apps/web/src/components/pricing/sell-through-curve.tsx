// Sell-through curve — the price ↔ time-to-sell tradeoff for the dynamic engine's arms.
// Each row is one price arm: the price, a bar for P(sell within 14 days), and the
// estimated days to sell. The arm the bandit chose is highlighted. This is the UI face
// of "the model perceives, the rules decide": every number here comes straight from the
// PricingDecision the API returned — nothing is invented client-side.

import type { PricingDecision, SellThroughCurvePoint } from '@reloop/shared';

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

interface Props {
  decision: PricingDecision;
}

export function SellThroughCurve({ decision }: Props) {
  const chosenPrice = decision.anchorPrice * decision.chosenArm;
  // Sort cheapest → priciest so the curve reads top-to-bottom like the pitch deck.
  const points: SellThroughCurvePoint[] = [...decision.sellThroughCurve].sort(
    (a, b) => a.price - b.price,
  );

  return (
    <div className="space-y-2">
      {points.map((p) => {
        const isChosen = Math.abs(p.price - chosenPrice) < 1;
        return (
          <div
            key={p.price}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ${
              isChosen ? 'bg-brand/10 ring-brand' : 'bg-secondary ring-border'
            }`}
          >
            <span className="w-20 shrink-0 font-semibold tabular-nums">{inr(p.price)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
              <div
                className={`h-full rounded-full ${isChosen ? 'bg-brand' : 'bg-muted-foreground/50'}`}
                style={{ width: `${Math.round(p.probability * 100)}%` }}
              />
            </div>
            <span className="w-28 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
              ~{p.expectedDaysToSell}d · {Math.round(p.probability * 100)}%
            </span>
            {isChosen ? (
              <span className="w-24 shrink-0 text-right text-xs font-semibold text-brand">
                recommended
              </span>
            ) : (
              <span className="w-24 shrink-0" />
            )}
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">
        Bar = probability of selling within 14 days at that price. The highlighted arm is
        what the bandit chose, after guardrails.
      </p>
    </div>
  );
}
