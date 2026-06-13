'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/ui/section';
import { Button } from '@/components/ui/button';

export type Stage = 'grading' | 'pricing' | 'card' | 'done';

type StepStatus = 'pending' | 'active' | 'done' | 'error';

const STEPS: { key: 'grade' | 'reference' | 'price' | 'card'; label: string }[] = [
  { key: 'grade', label: 'Grading your photos' },
  { key: 'reference', label: 'Comparing to original listing' },
  { key: 'price', label: 'Estimating a fair price' },
  { key: 'card', label: 'Assembling the Health Card' },
];

// stage → how far the pipeline has progressed (grade & reference resolve together).
const DONE_THROUGH: Record<Stage, number> = { grading: 0, pricing: 2, card: 3, done: 4 };

function statusFor(index: number, stage: Stage, failed: boolean): StepStatus {
  const done = DONE_THROUGH[stage];
  if (index < done) return 'done';
  if (failed) return index === done || (stage === 'grading' && index <= 1) ? 'error' : 'pending';
  // grade + reference are both "active" during the grading stage.
  if (stage === 'grading') return index <= 1 ? 'active' : 'pending';
  return index === done ? 'active' : 'pending';
}

function Glyph({ status }: { status: StepStatus }) {
  if (status === 'done')
    return <span className="grid size-5 place-items-center rounded-full bg-brand/15 text-[10px] text-brand">✓</span>;
  if (status === 'error')
    return <span className="grid size-5 place-items-center rounded-full bg-destructive/15 text-[10px] text-destructive">✕</span>;
  if (status === 'active')
    return (
      <span className="grid size-5 place-items-center rounded-full bg-brand/10">
        <span className="size-1.5 animate-pulse rounded-full bg-brand" />
      </span>
    );
  return <span className="grid size-5 place-items-center rounded-full border border-border" />;
}

export function ProcessingStep({
  stage,
  failedStage,
  errorMsg,
  photoCount,
  onRetry,
  onBack,
}: {
  stage: Stage;
  failedStage: Stage | null;
  errorMsg: string;
  photoCount: number;
  onRetry: () => void;
  onBack: () => void;
}) {
  const failed = failedStage !== null;
  const [cursor, setCursor] = useState(1);

  // Cycle a per-photo cursor while grading is in flight (presentation only).
  useEffect(() => {
    if (stage !== 'grading' || failed || photoCount <= 1) return;
    const id = setInterval(() => setCursor((c) => (c % photoCount) + 1), 700);
    return () => clearInterval(id);
  }, [stage, failed, photoCount]);

  return (
    <div className="mx-auto max-w-xl">
      <Panel label="inspection.live" status={failed ? 'HALT ●' : 'REC ●'}>
        <ul className="space-y-3">
          {STEPS.map((step, i) => {
            const status = statusFor(i, stage, failed);
            const detail =
              step.key === 'grade' && status === 'active' && photoCount > 1
                ? `photo ${cursor} of ${photoCount}`
                : null;
            return (
              <li key={step.key} className="flex items-center gap-3">
                <Glyph status={status} />
                <span
                  className={`text-sm ${
                    status === 'pending' ? 'text-muted-foreground/50' : 'text-foreground'
                  }`}
                >
                  {step.label}
                </span>
                {detail && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {detail}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {failed && (
          <div className="mt-6 border-t border-border/60 pt-4">
            <p className="text-sm text-destructive">{errorMsg}</p>
            <div className="mt-4 flex gap-3">
              <Button variant="primary" onClick={onRetry}>
                Try again
              </Button>
              <Button variant="secondary" onClick={onBack}>
                Back to photos
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {!failed && (
        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Grading at the source · before it moves
        </p>
      )}
    </div>
  );
}
