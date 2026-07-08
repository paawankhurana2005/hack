'use client';

import { useEffect, useRef } from 'react';
import type { AgentEvent, AgentPhase } from '@reloop/shared';
import { ModelMetaBadge } from './model-meta-badge';

const PHASE_META: Record<AgentPhase, { label: string; dot: string; text: string }> = {
  perceived: { label: 'Perceived', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
  diagnosed: { label: 'Diagnosed', dot: 'bg-sky-400', text: 'text-foreground' },
  decided: { label: 'Decided', dot: 'bg-brand', text: 'text-foreground' },
  acted: { label: 'Acted', dot: 'bg-brand', text: 'text-foreground' },
};

/** The live agent reasoning log — perceived → diagnosed → acted, with numbers. */
export function ActivityFeed({ events, thinking }: { events: AgentEvent[]; thinking?: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length, thinking]);

  return (
    <div className="rounded-2xl bg-card ring-1 ring-border">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Agent activity</p>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {events.length} entries
        </span>
      </div>
      <div className="max-h-[420px] overflow-y-auto px-5 py-4">
        <ol className="space-y-1">
          {events.map((e, i) => {
            const meta = PHASE_META[e.phase];
            const newDay = i === 0 || events[i - 1]!.day !== e.day;
            return (
              <li key={`${e.day}-${i}`}>
                {newDay && (
                  <div className="mb-1 mt-3 first:mt-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                    Day {e.day}
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${meta.dot}`} />
                    {i < events.length - 1 && <span className="w-px flex-1 bg-border/60" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {meta.label}
                    </span>
                    <p className={`text-sm leading-snug ${meta.text}`}>{e.text}</p>
                    {e.factors && e.factors.length > 0 && (
                      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {e.factors.map((f) => (
                          <li key={f.label} className="font-mono text-[10px] text-muted-foreground">
                            {f.label}: <span className="text-foreground">{f.value}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {e.priceFromCents !== undefined && e.priceToCents !== undefined && (
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-brand">
                        ₹{Math.round(e.priceFromCents / 100).toLocaleString('en-IN')} → ₹
                        {Math.round(e.priceToCents / 100).toLocaleString('en-IN')}
                        {e.floorCents !== undefined && (
                          <span className="text-muted-foreground">
                            {'  '}· floor ₹{Math.round(e.floorCents / 100).toLocaleString('en-IN')}
                          </span>
                        )}
                      </p>
                    )}
                    {e.phase === 'acted' && <div><ModelMetaBadge modelMeta={e.modelMeta} /></div>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {thinking && (
          <div className="flex items-center gap-2 pl-5 text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
            <span className="font-mono text-[11px]">agent reasoning…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
