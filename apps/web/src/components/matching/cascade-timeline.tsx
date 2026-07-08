'use client';

// Live cascade timeline for the local-buyer matching engine (spec 023/024) —
// "show the logs, not the UI." Polls the real match session and renders
// buyer #1 notified → declined/timeout → buyer #2 notified → ... → matched
// or warehouse-fallback, each entry with its REAL proximity/intent/priceFit/
// recency score breakdown (matchingEngine.ts's findCandidates ranking), not
// just a summary. Nothing here is simulated client-side — every number comes
// straight from GET /api/matching/status/:returnId.

import { useEffect, useRef, useState } from 'react';
import type { MatchCandidateGeo, MatchStatusResponse } from '@reloop/shared';
import { getMatchingStatus, ApiRequestError } from '@/lib/api-client';

const POLL_MS = 3000;

const RESPONSE_STYLE: Record<MatchCandidateGeo['response'], { label: string; cls: string }> = {
  pending: { label: 'Notified · waiting', cls: 'bg-brand/15 text-brand' },
  accepted: { label: 'Accepted', cls: 'bg-success/15 text-success' },
  declined: { label: 'Declined', cls: 'bg-danger/15 text-danger' },
  timeout: { label: 'Timed out', cls: 'bg-warning/15 text-warning' },
};

const SESSION_STYLE: Record<MatchStatusResponse['status'], { label: string; cls: string }> = {
  searching: { label: 'Searching for candidates', cls: 'text-muted-foreground' },
  notifying: { label: 'Cascade in progress', cls: 'text-brand' },
  matched: { label: 'Matched', cls: 'text-success' },
  expired: { label: 'Expired', cls: 'text-warning' },
  warehouse_fallback: { label: 'Fell back to warehouse', cls: 'text-warning' },
};

function fmtTime(v: Date | string | null): string {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function scoreRow(c: MatchCandidateGeo) {
  return `proximity ${c.proximityScore.toFixed(2)} · intent ${c.intentScore.toFixed(2)} · priceFit ${c.priceFitScore.toFixed(2)} · recency ${c.recencyScore.toFixed(2)}`;
}

export function CascadeTimeline({ returnId }: { returnId: string }) {
  const [status, setStatus] = useState<MatchStatusResponse | null>(null);
  const [error, setError] = useState('');
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    async function poll() {
      try {
        const res = await getMatchingStatus(returnId);
        if (!cancelledRef.current) {
          setStatus(res);
          setError('');
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setError(err instanceof ApiRequestError ? err.message : 'Could not reach the matching engine.');
        }
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [returnId]);

  if (error && !status) {
    return (
      <div className="mt-3 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
        Notification cascade unavailable — {error}
      </div>
    );
  }
  if (!status) return null;

  const sessionMeta = SESSION_STYLE[status.status];

  return (
    <div className="mt-3 rounded-xl bg-[#0b1220] p-4 font-mono text-[11px] leading-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="uppercase tracking-widest text-[#6b7c93]">Notification cascade</span>
        <span className={`uppercase tracking-widest ${sessionMeta.cls}`}>{sessionMeta.label}</span>
      </div>
      <ol className="space-y-3">
        {status.candidates.map((c, i) => {
          const rs = RESPONSE_STYLE[c.response];
          return (
            <li key={c.buyerId} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#1c2838] text-[#e6edf3]">
                  {i + 1}
                </span>
                {i < status.candidates.length - 1 && <span className="w-px flex-1 bg-[#1c2838]" />}
              </div>
              <div className="flex-1 pb-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[#e6edf3]">{c.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${rs.cls}`}>
                    {rs.label}
                  </span>
                  <span className="text-[#6b7c93]">{c.distanceKm}km · score {c.matchScore.toFixed(2)}</span>
                </div>
                <p className="mt-0.5 text-[#9fe6a0]">{scoreRow(c)}</p>
                <p className="mt-0.5 text-[#6b7c93]">
                  notified {fmtTime(c.notifiedAt)}
                  {c.responseAt ? ` · responded ${fmtTime(c.responseAt)}` : ''}
                </p>
              </div>
            </li>
          );
        })}
        {status.candidates.length === 0 && (
          <li className="text-[#6b7c93]">No buyer notified yet — still resolving candidates.</li>
        )}
      </ol>
      {status.status === 'matched' && status.matchedBuyerId && (
        <p className="mt-2 border-t border-[#1c2838] pt-2 text-[#9fe6a0]">
          matched → buyer {status.matchedBuyerId} at {fmtTime(status.matchedAt)}
        </p>
      )}
    </div>
  );
}
