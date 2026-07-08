'use client';

// Spec 026: the Sales Agent's "watch it happen" live feed — a flat, ever-
// growing stream across the WHOLE portfolio (not one listing), so a demo
// audience can see every listing's narrated action as it happens. Same
// visual language as ActivityFeed, generalized to tag each line with which
// listing produced it.

import { useEffect, useRef } from 'react';
import type { AgentAction, AgentEvent } from '@reloop/shared';
import { ModelMetaBadge } from './model-meta-badge';
import { RawEventLog } from './raw-event-log';

const ACTION_LABEL: Partial<Record<AgentAction, string>> = {
  hold: 'Held',
  reprice: 'Repriced',
  widen_radius: 'Widened radius',
  improve_listing: 'Flagged for improvement',
  escalate_route: 'Escalated',
  relist: 'Relisted',
};

export function LiveSimFeed({
  events,
  thinking,
  showTrace,
}: {
  events: AgentEvent[];
  thinking?: boolean;
  /** Opt-in technical trace view — renders the real structured event JSON
   *  under each line. Off by default. */
  showTrace?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length, thinking]);

  return (
    <div className="rounded-2xl bg-card ring-1 ring-border">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Live simulation feed
        </p>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {events.length} actions
        </span>
      </div>
      <div className="max-h-[420px] overflow-y-auto px-5 py-4">
        {events.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Start the simulation to watch the agent work through your listings.
          </p>
        )}
        <ol className="space-y-3">
          {events.map((e, i) => (
            <li key={`${e.listingId ?? 'x'}-${e.day}-${i}`} className="flex gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-foreground">
                    {e.listingTitle ?? 'A listing'}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {e.action ? ACTION_LABEL[e.action] ?? e.action : 'Update'} · Day {e.day}
                  </span>
                </div>
                <p className="text-sm leading-snug text-muted-foreground">{e.text}</p>
                <div className="mt-1"><ModelMetaBadge modelMeta={e.modelMeta} /></div>
                {showTrace && <RawEventLog event={e} />}
              </div>
            </li>
          ))}
        </ol>
        {thinking && (
          <div className="flex items-center gap-2 pl-5 pt-2 text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
            <span className="font-mono text-[11px]">working through the portfolio…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
