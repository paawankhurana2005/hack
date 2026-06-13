'use client';

import type {
  GradingResult,
  ImpactEstimate,
  OwnedItem,
  PricingResult,
  ProductHealthCard,
} from '@reloop/shared';
import type { CompressedImage } from '@/lib/image';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/section';
import { formatMoney } from '@/lib/money';

const gradeTone = {
  new: 'success',
  'like-new': 'success',
  good: 'accent',
  fair: 'warning',
  poor: 'danger',
} as const;

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReviewStep({
  item,
  grading,
  pricing,
  card,
  impact,
  userPhotos,
  onConfirm,
}: {
  item: OwnedItem;
  grading: GradingResult;
  pricing: PricingResult;
  card: ProductHealthCard;
  impact: ImpactEstimate;
  userPhotos: CompressedImage[];
  onConfirm: () => void;
}) {
  const ref = grading.referenceComparison;
  const pctOfPaid = Math.round((pricing.suggestedPrice.amountCents / item.originalPrice.amountCents) * 100);

  return (
    <div className="space-y-6">
      {/* a. Verdict */}
      <Panel label="grade.verdict" status="GRADED ●">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge tone={gradeTone[grading.grade]}>{grading.grade}</Badge>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Confidence{' '}
              <span className="text-brand">{(grading.confidence * 100).toFixed(0)}%</span>
            </span>
          </div>
        </div>
        <p className="mt-4 text-lg text-foreground">{grading.summary}</p>
      </Panel>

      {/* b. Reference comparison */}
      {ref ? (
        <Card>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
              Checked against the original listing
            </p>
            <Badge tone={ref.authenticityMatch ? 'success' : 'danger'}>
              {ref.authenticityMatch
                ? `✓ Product match · ${(ref.authenticityConfidence * 100).toFixed(0)}%`
                : '⚠ Possible mismatch'}
            </Badge>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Your photos
              </p>
              <div className="grid grid-cols-3 gap-2">
                {userPhotos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.dataUrl}
                    src={p.dataUrl}
                    alt={`Yours ${i + 1}`}
                    className="h-16 w-full rounded-lg object-cover ring-1 ring-border"
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Original listing
              </p>
              <div className="grid grid-cols-3 gap-2">
                {item.originalListingImages.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt={`Original ${i + 1}`}
                    className="h-16 w-full rounded-lg object-cover ring-1 ring-border"
                  />
                ))}
              </div>
            </div>
          </div>

          {ref.changedFromOriginal.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Changed from original
              </p>
              <ul className="mt-2 space-y-1.5">
                {ref.changedFromOriginal.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ref.specMatches.length > 0 && (
            <div className="mt-4 space-y-px">
              {ref.specMatches.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between border-b border-border/40 py-1.5"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {s.label}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-xs text-foreground">
                    {s.observed}
                    <span className={s.match ? 'text-brand' : 'text-destructive'}>
                      {s.match ? '✓' : '✕'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm text-muted-foreground">{ref.gradeImpact}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Comparison · {ref.source}
          </p>
        </Card>
      ) : (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Reference check unavailable
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t compare against the original listing this time — the grade above still stands.
          </p>
        </Card>
      )}

      {/* c. Detected issues */}
      {grading.detectedIssues.length > 0 && (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Detected issues
          </p>
          <ul className="mt-2 space-y-1.5">
            {grading.detectedIssues.map((issue) => (
              <li key={issue} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                {issue}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* d. Price + why */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Suggested resale price
          </p>
          <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums text-brand">
            {formatMoney(pricing.suggestedPrice)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="line-through">{formatMoney(pricing.estimatedRetail)}</span> est. retail ·{' '}
            <span className="text-brand">{Math.round(pricing.discountPct * 100)}% off</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ≈ {pctOfPaid}% of the {formatMoney(item.originalPrice)} you paid · {pricing.demand} demand
          </p>
        </Card>

        <Panel label="/api/sell/price · rationale">
          <p className="text-sm text-foreground">{pricing.rationale}</p>
          <div className="mt-4 space-y-px">
            {pricing.factors.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between border-b border-border/40 py-2"
              >
                <span className="text-xs text-muted-foreground">{f.label}</span>
                <span className="font-mono text-xs text-foreground">{f.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* e. Health Card preview */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
              Product Health Card · preview
            </p>
            <h3 className="mt-1 font-semibold tracking-tight text-foreground">{card.title}</h3>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={gradeTone[card.grade]}>{card.grade}</Badge>
            {card.authenticityVerified && <Badge tone="success">✓ Authenticity verified</Badge>}
          </div>
        </div>
        <p className="mt-3 text-sm text-foreground">{card.summary}</p>
        <div className="mt-4 rounded-xl bg-background/60 p-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-brand">History</p>
          <ol className="relative space-y-3 pl-4">
            <span className="absolute bottom-1 left-[5px] top-1 w-px bg-border" />
            {card.history.map((e) => (
              <li key={e.label} className="relative flex items-center justify-between text-sm">
                <span className="flex items-center gap-3 text-foreground">
                  <span className="absolute -left-4 size-2 rounded-full bg-brand ring-2 ring-card" />
                  {e.label}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{when(e.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      {/* f. Projected impact */}
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Projected impact · vs landfill
        </p>
        <div className="mt-3 grid grid-cols-2 gap-6">
          <div>
            <p className="text-3xl font-semibold tabular-nums text-foreground">
              {impact.ecoCredits}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              EcoCredits earned
            </p>
          </div>
          <div>
            <p className="text-3xl font-semibold tabular-nums text-foreground">
              {impact.co2SavedKg}
              <span className="ml-1 text-lg text-muted-foreground">kg</span>
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              CO₂ saved
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Derived from the item category and recovered value — not a measured figure.
        </p>
      </Card>

      {/* g. Confirm */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <Button variant="primary" className="w-full sm:w-auto" onClick={onConfirm}>
          List it for a second life →
        </Button>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Nothing is listed until you confirm
        </p>
      </div>
    </div>
  );
}
