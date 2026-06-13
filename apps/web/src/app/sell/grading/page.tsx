'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GradeRequest } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FlowNav } from '@/components/layout/flow-nav';
import { gradeItem, ApiRequestError } from '@/lib/api-client';
import { useSellFlow } from '../sell-flow-context';

type Status = 'no-input' | 'loading' | 'success' | 'error';

const gradeTone = {
  new: 'success',
  'like-new': 'success',
  good: 'accent',
  fair: 'warning',
  poor: 'danger',
} as const;

export default function SellGradingPage() {
  const { draft, images, result, setResult, setPricing, setCard } = useSellFlow();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string>('');
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    setStatus('loading');
    setError('');
    const req: GradeRequest = {
      draft: {
        title: draft.title,
        category: draft.category,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      },
      imagesBase64: images.map((i) => i.base64),
    };
    try {
      const res = await gradeItem(req);
      setResult(res);
      setPricing(null); // a fresh grade invalidates any prior price + card
      setCard(null);
      setStatus('success');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Grading failed. Please try again.');
      setStatus('error');
    }
  }, [draft, images, setResult, setPricing, setCard]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (images.length === 0) {
      setStatus(result ? 'success' : 'no-input');
      return;
    }
    if (result) {
      setStatus('success');
      return;
    }
    void run();
  }, [images.length, result, run]);

  return (
    <PageShell
      title="AI grading"
      description="The eyes — a multimodal read of your item's condition from its photos."
    >
      {status === 'no-input' && (
        <Card>
          <p className="text-sm text-muted">
            No item to grade yet. Head back and add a few photos first.
          </p>
          <div className="mt-4">
            <Button href="/sell" variant="secondary">
              ← Back to start
            </Button>
          </div>
        </Card>
      )}

      {status === 'loading' && (
        <Card>
          <p className="text-sm text-orange-500">Reading your photos…</p>
          <p className="mt-1 text-xs text-muted">
            Assessing condition with {draft.title ? `“${draft.title}”` : 'the model'}.
          </p>
        </Card>
      )}

      {status === 'error' && (
        <Card className="border-danger/40">
          <p className="text-sm text-danger">{error}</p>
          <div className="mt-4 flex gap-3">
            <Button variant="primary" onClick={() => void run()}>
              Try again
            </Button>
            <Button href="/sell" variant="secondary">
              Back to start
            </Button>
          </div>
        </Card>
      )}

      {status === 'success' && result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Condition grade</span>
              <Badge tone={gradeTone[result.grade]}>{result.grade}</Badge>
            </div>
            <p className="mt-3 text-sm text-white">{result.summary}</p>
            <p className="mt-2 text-xs text-muted">
              Confidence {(result.confidence * 100).toFixed(0)}%
            </p>
            {result.detectedIssues.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted">Detected issues</p>
                <ul className="mt-1 list-inside list-disc text-sm text-muted">
                  {result.detectedIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {result.photoUrls.length > 0 && (
            <Card>
              <p className="text-sm text-muted">Graded photos</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {result.photoUrls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt={`Graded photo ${i + 1}`}
                    className="h-28 w-full rounded-sm object-cover"
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <FlowNav
        prevHref="/sell"
        nextHref={status === 'success' ? '/sell/routing' : undefined}
      />
    </PageShell>
  );
}
