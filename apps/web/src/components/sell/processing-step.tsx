'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import type { CompressedImage } from '@/lib/image';

export type Stage = 'grading' | 'pricing' | 'card' | 'done';

type StepStatus = 'pending' | 'active' | 'done' | 'error';

const STEPS: { key: 'grade' | 'reference' | 'price' | 'card'; label: string }[] = [
  { key: 'grade', label: 'Grading your photos' },
  { key: 'reference', label: 'Comparing to original listing' },
  { key: 'price', label: 'Estimating a fair price' },
  { key: 'card', label: 'Assembling the Health Card' },
];

// What the model is "looking at" while grading — cycles for the alive feel.
const CHECKS = [
  'Structural integrity',
  'Authenticity vs original listing',
  'Wear & scratch detection',
  'Serial / spec match',
];

// stage → how far the pipeline has progressed (grade & reference resolve together).
const DONE_THROUGH: Record<Stage, number> = { grading: 0, pricing: 2, card: 3, done: 4 };

function statusFor(index: number, stage: Stage, failed: boolean): StepStatus {
  const done = DONE_THROUGH[stage];
  if (index < done) return 'done';
  if (failed) return index === done || (stage === 'grading' && index <= 1) ? 'error' : 'pending';
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
  photos,
  onRetry,
  onBack,
}: {
  stage: Stage;
  failedStage: Stage | null;
  errorMsg: string;
  photos: CompressedImage[];
  onRetry: () => void;
  onBack: () => void;
}) {
  const failed = failedStage !== null;
  const photoCount = photos.length;
  const grading = stage === 'grading' && !failed;
  const [photoCursor, setPhotoCursor] = useState(0);
  const [checkCursor, setCheckCursor] = useState(0);

  // Cycle the inspected photo + the "what it's checking" caption while grading.
  useEffect(() => {
    if (!grading) return;
    const p = setInterval(() => setPhotoCursor((c) => (c + 1) % Math.max(1, photoCount)), 900);
    const k = setInterval(() => setCheckCursor((c) => (c + 1) % CHECKS.length), 1100);
    return () => {
      clearInterval(p);
      clearInterval(k);
    };
  }, [grading, photoCount]);

  const shown = photos[Math.min(photoCursor, photoCount - 1)];

  return (
    <div className="mx-auto max-w-xl">
      <Panel label="inspection.live" status={failed ? 'HALT ●' : 'REC ●'}>
        {/* Scan viewport */}
        {shown && (
          <div className="relative mb-5 aspect-[16/10] overflow-hidden rounded-xl bg-background ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown.dataUrl} alt="Inspecting" className="h-full w-full object-cover opacity-90" />
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[14%] top-[16%] h-12 w-12 border-l-2 border-t-2 border-brand/80" />
              <div className="absolute right-[14%] top-[16%] h-12 w-12 border-r-2 border-t-2 border-brand/80" />
              <div className="absolute bottom-[16%] left-[14%] h-12 w-12 border-b-2 border-l-2 border-brand/80" />
              <div className="absolute bottom-[16%] right-[14%] h-12 w-12 border-b-2 border-r-2 border-brand/80" />
              {grading && (
                <div className="absolute inset-x-0 top-0 h-[2px] animate-scan bg-brand shadow-[0_0_24px_oklch(var(--brand))]" />
              )}
            </div>
            <div className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-widest text-brand">
              {grading
                ? `Scanning · photo ${Math.min(photoCursor + 1, photoCount)}/${photoCount}`
                : failed
                  ? 'Halted'
                  : 'Scan complete'}
            </div>
            {grading && (
              <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                Checking · <span className="text-brand">{CHECKS[checkCursor]}</span>
              </div>
            )}
          </div>
        )}

        {/* Checklist */}
        <ul className="space-y-3">
          {STEPS.map((step, i) => {
            const status = statusFor(i, stage, failed);
            return (
              <li key={step.key} className="flex items-center gap-3">
                <Glyph status={status} />
                <span
                  className={`text-sm ${status === 'pending' ? 'text-muted-foreground/50' : 'text-foreground'}`}
                >
                  {step.label}
                </span>
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
