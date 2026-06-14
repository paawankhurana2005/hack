'use client';

import type { ReturnRiskPrediction } from '@reloop/shared';
import { pct, riskTone } from '@/lib/prevention';

interface ReturnRiskPanelProps {
  prediction: ReturnRiskPrediction;
  /** Called when the shopper accepts the safer-variant nudge. */
  onSwitch: (variantLabel: string) => void;
}

/**
 * The Return-Prevention nudge, shown the moment a variant is picked. Tone shifts
 * with risk: amber caution for high/moderate, gold confidence for low. The whole
 * card re-mounts per variant (keyed by the caller) so it fades in on each change.
 */
export function ReturnRiskPanel({ prediction, onSwitch }: ReturnRiskPanelProps) {
  const tone = riskTone(prediction.riskLevel);
  const rec = prediction.recommendation;

  return (
    <div
      className={`rounded-2xl ${tone.bg} p-5 ring-1 ${tone.ring}`}
      style={{ animation: 'fade-up 0.3s ease both' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className={`size-1.5 rounded-full ${tone.dot}`} />
          <span className={`font-mono text-[10px] uppercase tracking-widest ${tone.text}`}>
            {tone.label}
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          AI · {pct(prediction.confidence)} confidence
        </span>
      </div>

      <p className="mt-3 text-sm text-foreground">
        <span className={`text-2xl font-semibold tabular-nums ${tone.text}`}>
          {pct(prediction.returnRate)}
        </span>{' '}
        <span className="text-muted-foreground">
          of shoppers return <span className="text-foreground">{prediction.variantLabel}</span>
        </span>
      </p>

      {/* Reason breakdown — why this variant comes back */}
      <div className="mt-4 space-y-2">
        {prediction.reasons.map((r) => (
          <div key={r.reason} className="flex items-center gap-3">
            <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {r.reason}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/60">
              <span
                className={`block h-full rounded-full ${tone.dot}`}
                style={{ width: `${Math.round(r.share * 100)}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {pct(r.share)}
            </span>
          </div>
        ))}
      </div>

      {/* Smart recommendation — the prevention nudge */}
      {rec ? (
        <div className="mt-5 rounded-xl bg-background/50 p-4">
          <p className="text-sm text-foreground">
            Consider <span className="font-semibold text-brand">{rec.variantLabel}</span> — only{' '}
            <span className="font-semibold text-brand tabular-nums">{pct(rec.returnRate)}</span> come
            back.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{rec.rationale}</p>
          <button
            type="button"
            onClick={() => onSwitch(rec.variantLabel)}
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground ring-1 ring-brand/50 transition hover:bg-brand-strong active:scale-95"
          >
            Switch to {rec.variantLabel} →
          </button>
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-background/50 p-3 text-center text-xs text-muted-foreground">
          Great fit for most shoppers — you just helped avoid a likely return.
        </p>
      )}
    </div>
  );
}
