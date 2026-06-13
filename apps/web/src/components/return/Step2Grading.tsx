'use client';

import { useEffect, useState, useRef } from 'react';
import type { GradingScenario, ReturnFlowState, ReturnGradingResult } from '@reloop/shared';
import { mockGradeItem } from '@/lib/mocks/return-flow';
import { Card } from '@/components/ui/card';

interface Props {
  flowState: ReturnFlowState;
  onNext: (partial: Partial<ReturnFlowState>) => void;
  gradingScenario: string | undefined;
}

type Status = 'loading' | 'retake' | 'warehouse_fallback' | 'error_fallback' | 'done';

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-success/20 text-success border-success/30',
  B: 'bg-warning/20 text-warning border-warning/30',
  C: 'bg-brand/20 text-brand border-brand/30',
  Salvage: 'bg-danger/20 text-danger border-danger/30',
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const label = value >= 0.8 ? 'High' : value >= 0.6 ? 'Medium' : 'Low';
  const color = value >= 0.8 ? 'bg-success' : value >= 0.6 ? 'bg-warning' : 'bg-danger';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>Confidence</span>
        <span>{label} ({pct}%)</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PulseSkeleton() {
  return (
    <Card>
      <div className="animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-40 rounded bg-secondary" />
          <div className="h-6 w-12 rounded bg-secondary" />
        </div>
        <div className="h-2 w-full rounded bg-secondary" />
        <div className="space-y-2">
          <div className="h-3 w-3/4 rounded bg-secondary" />
          <div className="h-3 w-1/2 rounded bg-secondary" />
        </div>
        <div className="mt-4 text-center">
          <p className="text-sm font-semibold text-foreground">Inspecting your item…</p>
          <p className="mt-1 text-xs text-muted-foreground">AI is reviewing your photos</p>
        </div>
      </div>
    </Card>
  );
}

export function Step2Grading({ flowState, onNext, gradingScenario }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [result, setResult] = useState<ReturnGradingResult | null>(null);
  const [retryPhotos, setRetryPhotos] = useState<string[]>([]);
  const retryCount = useRef(0);
  const retryInputRef = useRef<HTMLInputElement>(null);

  const scenario = (gradingScenario as GradingScenario | undefined) ?? 'high_confidence';

  async function runGrading(photos: string[]) {
    setStatus('loading');
    try {
      const res = await mockGradeItem(flowState.reason, photos, scenario);
      setResult(res);
      if (res.confidence < 0.6) {
        if (retryCount.current >= 1) {
          setStatus('warehouse_fallback');
        } else {
          setStatus('retake');
        }
      } else {
        setStatus('done');
      }
    } catch {
      setStatus('error_fallback');
    }
  }

  useEffect(() => {
    void runGrading(flowState.photos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRetakeFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const urls = Array.from(files).map((f) => URL.createObjectURL(f));
    setRetryPhotos(urls);
    retryCount.current += 1;
    void runGrading(urls);
  }

  function handleContinue() {
    if (!result) return;
    onNext({ gradingResult: result, currentStep: 3 });
  }

  // Grading was inconclusive — pass whatever partial result we have to the
  // Intelligent Bridge instead of pre-deciding warehouse. The bridge can still
  // find a local path (refurbish, donate) based on category and demand signals.
  function handleBridgeFallback() {
    onNext({
      gradingResult: result ?? undefined,
      currentStep: 3,
    });
  }

  if (status === 'loading') return <PulseSkeleton />;

  if (status === 'error_fallback') {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Unable to grade at this time. Proceeding with standard return.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleBridgeFallback}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
          >
            Continue
          </button>
        </div>
      </Card>
    );
  }

  if (status === 'warehouse_fallback') {
    return (
      <Card>
        <p className="font-semibold text-foreground">Grading inconclusive</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Visual grading wasn't conclusive. The Intelligent Bridge will still try to find a local
          path — your item will be inspected in person before any resale.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleBridgeFallback}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
          >
            Find best local path
          </button>
        </div>
      </Card>
    );
  }

  if (status === 'retake') {
    return (
      <Card>
        <p className="font-semibold text-foreground">Clearer photo needed</p>
        <p className="mt-2 text-sm text-muted-foreground">
          We need a clearer photo to complete grading. Please retake and upload a new photo.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => retryInputRef.current?.click()}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
          >
            Retake photo
          </button>
          <button
            type="button"
            onClick={handleBridgeFallback}
            className="rounded-lg border border-border px-5 py-2.5 text-sm text-muted-foreground hover:border-brand/50"
          >
            Skip — route via Bridge
          </button>
        </div>
        <input
          ref={retryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleRetakeFiles(e.target.files)}
        />
        {retryPhotos.length > 0 && (
          <div className="mt-4 flex gap-2">
            {retryPhotos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt="retry" className="h-16 w-16 rounded-lg object-cover" />
            ))}
          </div>
        )}
      </Card>
    );
  }

  // status === 'done' — show result
  if (!result) return null;

  return (
    <Card>
      <div className="space-y-5">
        {/* Grade badge */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Condition grade</span>
          {result.grade && (
            <span
              className={`rounded border px-3 py-1 text-sm font-bold ${GRADE_COLORS[result.grade] ?? 'bg-secondary text-foreground'}`}
            >
              Grade {result.grade}
            </span>
          )}
        </div>

        {/* Confidence bar */}
        <ConfidenceBar value={result.confidence} />

        {/* Authenticity */}
        <div className="flex items-center gap-2">
          {result.authenticityMatch ? (
            <span className="text-sm text-success">✓ Matches product records</span>
          ) : (
            <span className="text-sm text-warning">⚠ Mismatch detected</span>
          )}
        </div>

        {/* Auth mismatch warning */}
        {!result.authenticityMatch && (
          <div className="rounded-lg border-l-4 border-warning bg-warning/10 p-4">
            <p className="text-sm text-warning">
              These photos don't appear to match your product. Your return has been flagged for review.
            </p>
          </div>
        )}

        {/* Defects */}
        {result.defects.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Detected issues
            </p>
            <ul className="space-y-1">
              {result.defects.map((d) => (
                <li key={d} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-0.5 text-warning">•</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Wardrobe flag — neutral note */}
        {result.wardrobingFlag && (
          <p className="text-xs text-muted-foreground">
            Condition assessed as Grade {result.grade} based on photos.
          </p>
        )}

        {/* Functionally unverifiable note */}
        {!result.functionallyVerifiable && (
          <div className="rounded-lg border border-border bg-secondary p-3">
            <p className="text-sm text-muted-foreground">
              Functional condition not verified by visual grading. Item will be tested before resale.
            </p>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleContinue}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
          >
            Continue
          </button>
        </div>
      </div>
    </Card>
  );
}
