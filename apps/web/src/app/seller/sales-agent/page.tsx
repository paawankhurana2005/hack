'use client';

// Spec 024 — the Sales Agent: a portfolio-level batch driver over the existing
// per-listing Listing Agent. Reviews every listing a seller owns in one pass —
// reprices, widens reach, escalates, or relists an escalated return-sourced
// item whose local geo-demand has genuinely improved — and explains itself.

import { useEffect, useState } from 'react';
import type { SalesAgentDigest } from '@reloop/shared';
import { useRole } from '@/lib/role-context';
import {
  DEFAULT_SCHEDULE_INTERVAL_MS,
  getLastRunAt,
  markRunNow,
  runSalesAgent,
  runSalesAgentIfDue,
} from '@/lib/sales-agent';

const SCHEDULE_POLL_MS = 30_000; // how often we check "is a scheduled run due"

const ACTION_LABEL: Record<string, string> = {
  hold: 'Held',
  reprice: 'Repriced',
  widen_radius: 'Widened reach',
  improve_listing: 'Flagged listing',
  escalate_route: 'Escalated route',
  relist: 'Relisted',
};

export default function SalesAgentPage() {
  const { account } = useRole();
  const [digest, setDigest] = useState<SalesAgentDigest | null>(null);
  const [running, setRunning] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  async function handleRun() {
    if (!account?.id || running) return;
    setRunning(true);
    try {
      const result = await runSalesAgent(account.id);
      setDigest(result);
      markRunNow(account.id); // don't also fire the scheduled poll seconds later
    } finally {
      setRunning(false);
    }
  }

  // Phase 5: opt-in scheduled runs — polls every 30s to check whether the
  // (much longer) schedule interval has actually elapsed, via
  // runSalesAgentIfDue(). Locked (manually-driven) listings are skipped
  // automatically inside the Sales Agent itself.
  useEffect(() => {
    if (!scheduled || !account?.id) return;
    const id = account.id;
    const timer = setInterval(() => {
      void runSalesAgentIfDue(id, DEFAULT_SCHEDULE_INTERVAL_MS).then((result) => {
        if (result) setDigest(result);
      });
    }, SCHEDULE_POLL_MS);
    return () => clearInterval(timer);
  }, [scheduled, account?.id]);

  const lastRunAt = account?.id ? getLastRunAt(account.id) : null;

  return (
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Sales Agent
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sales Agent</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Reviews every listing you own in one pass — reprices, widens reach, escalates dead
        stock, and un-escalates a return-sourced item if local demand has genuinely picked up
        since it was given up on. It never invents its own pricing logic: every move goes
        through the same reward model, bandit, and guardrails a single listing already uses.
      </p>

      <div className="mt-8 rounded-2xl bg-card p-5 ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              On-demand · reviews your whole portfolio
            </p>
            {digest && (
              <p className="mt-1 text-sm text-foreground">{digest.narrative}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={scheduled}
                onChange={(e) => setScheduled(e.target.checked)}
                className="size-4 accent-brand"
              />
              Run automatically (every 5 min)
            </label>
            <button
              type="button"
              disabled={running || !account?.id}
              onClick={() => void handleRun()}
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {running ? 'Running…' : 'Run Sales Agent'}
            </button>
          </div>
        </div>
        {scheduled && (
          <p className="mt-3 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Scheduled — last ran{' '}
            {lastRunAt ? `${Math.round((Date.now() - lastRunAt) / 60_000)}m ago` : 'not yet'}. Listings you're
            actively driving manually are skipped automatically.
          </p>
        )}
      </div>

      {digest && (
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Actions this run
            </p>
            <ul className="mt-3 space-y-2">
              {Object.entries(digest.actionsByType).length === 0 && (
                <li className="text-sm text-muted-foreground">Nothing needed attention.</li>
              )}
              {Object.entries(digest.actionsByType).map(([action, count]) => (
                <li key={action} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{ACTION_LABEL[action] ?? action}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs tabular-nums text-brand">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-border/60 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {digest.listingsReviewed} listing{digest.listingsReviewed === 1 ? '' : 's'} reviewed
            </p>
          </div>

          <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Per-listing reasoning
            </p>
            <ul className="mt-3 space-y-3">
              {digest.events.length === 0 && (
                <li className="text-sm text-muted-foreground">No listings acted on this run.</li>
              )}
              {digest.events.map((e, i) => (
                <li key={i} className="border-b border-border/40 pb-3 last:border-0">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                    {e.action ? (ACTION_LABEL[e.action] ?? e.action) : 'Update'}
                  </p>
                  <p className="mt-1 text-sm text-foreground">{e.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
