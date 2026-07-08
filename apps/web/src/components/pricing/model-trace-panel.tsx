// Technical trace view for the dynamic-pricing engine (spec 014/024) — "show the
// logs, not the UI." Opt-in (toggled by a caller, off by default) so the clean
// seller-facing surfaces are undisturbed; this is for a pitch/demo walkthrough
// where the real feature vector, the real bandit exploration scores, and the
// model's real (frozen, offline) learned importances matter more than polish.
// Every number here is real: `decision.stateUsed` is the exact vector the
// reward model read for THIS call; `topFeatures` is the real trained XGBoost's
// SHAP-style importance from its offline evaluation (ml/pricing/runs).

import { useEffect, useState } from 'react';
import type { PriceArm, PricingDecision, PricingModelInfo } from '@reloop/shared';
import { PRICE_ARMS } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPricingModelInfo, ApiRequestError } from '@/lib/api-client';

function fmt(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

interface Props {
  decision: PricingDecision;
}

export function ModelTracePanel({ decision }: Props) {
  const [modelInfo, setModelInfo] = useState<PricingModelInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getPricingModelInfo()
      .then((info) => {
        if (!cancelled) setModelInfo(info);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : 'model-info request failed.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isRealModel = decision.modelVersion.startsWith('xgboost');
  const maxImportance = modelInfo ? Math.max(...modelInfo.topFeatures.map(([, v]) => v)) : 1;

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">What the reward model saw</h3>
          <Badge tone={isRealModel ? 'success' : 'neutral'}>{decision.modelVersion}</Badge>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {isRealModel
            ? 'Served by the real XGBoost model over HTTP (PRICING_MODEL_URL).'
            : 'Local heuristic fallback — the real XGBoost server was unreachable or unconfigured for this call.'}
        </p>
        <div className="max-h-72 overflow-y-auto rounded-xl bg-[#0b1220] p-3 font-mono text-[11px] leading-5 text-[#9fe6a0]">
          {Object.entries(decision.stateUsed).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-[#6b7c93]">{k}:</span>
              <span className="text-[#e6edf3]">{fmt(v)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Model internals (the pricing.decide log line)</h3>
        <div className="rounded-xl bg-[#0b1220] p-3 font-mono text-[11px] leading-5 text-[#e6edf3]">
          <pre className="whitespace-pre-wrap">
{JSON.stringify(
  {
    chosenArm: decision.chosenArm,
    predictedRewards: decision.predictedRewards,
    sampledScores: decision.sampledScores,
    guardrailsApplied: decision.guardrailsApplied,
    floor: decision.floor,
    ceiling: decision.ceiling,
    modelVersion: decision.modelVersion,
  },
  null,
  2,
)}
          </pre>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <code>predictedRewards</code> is what the model PERCEIVES per price arm.{' '}
          <code>sampledScores</code> is the Thompson-sampling bandit's noised score for each
          arm — the exact numbers it compared to pick <code>chosenArm</code>. Infeasible arms
          (outside the floor/ceiling) score <code>-1e9</code>.
        </p>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold">Trained-model feature importances</h3>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {modelInfo && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Real SHAP-style gain from the XGBoost warm-start's offline evaluation — val MAE ₹
              {modelInfo.valMae.toFixed(1)}, MAPE {modelInfo.valMape.toFixed(1)}% (
              {modelInfo.trainRows.toLocaleString('en-IN')} train / {modelInfo.valRows.toLocaleString('en-IN')} val
              rows, {modelInfo.featureDim} features). {modelInfo.dataSource}
            </p>
            <div className="space-y-1.5">
              {modelInfo.topFeatures.map(([name, importance]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                    {name}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(2, Math.round((importance / maxImportance) * 100))}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                    {importance.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** Small inline row for a per-arm sampled-score readout — reused wherever a
 *  compact view (not the full trace panel) is enough. */
export function SampledScoresRow({ decision }: { decision: PricingDecision }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(PRICE_ARMS as readonly PriceArm[]).map((arm) => (
        <span key={arm} className="font-mono text-[10px] text-muted-foreground">
          {arm}×: {decision.sampledScores[arm].toFixed(0)}
        </span>
      ))}
    </div>
  );
}
