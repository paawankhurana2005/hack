'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSubmittedReturns, type SubmittedReturn } from '@/lib/mocks/return-store';
import type { ReturnRoutingDecision } from '@reloop/shared';

const DECISION_STYLE: Record<ReturnRoutingDecision['decision'], { label: string; cls: string }> = {
  local_resale: { label: 'Local Buyer', cls: 'bg-success/20 text-success' },
  refurbish: { label: 'Refurbish', cls: 'bg-warning/20 text-warning' },
  donate: { label: 'Donate', cls: 'bg-secondary text-foreground' },
  recycle: { label: 'Recycle', cls: 'bg-brand/20 text-brand' },
  warehouse: { label: 'Warehouse', cls: 'bg-secondary text-muted-foreground' },
  return_to_seller: { label: 'Return to Seller', cls: 'bg-brand/20 text-brand' },
};

const GRADE_STYLE: Record<string, string> = {
  A: 'bg-success/20 text-success',
  B: 'bg-warning/20 text-warning',
  C: 'bg-brand/20 text-brand',
  Salvage: 'bg-danger/20 text-danger',
};

const STATUS_STYLE: Record<SubmittedReturn['status'], { label: string; cls: string; dot?: boolean }> = {
  pending_seller_approval: { label: 'Needs approval', cls: 'bg-warning/20 text-warning font-bold', dot: true },
  awaiting_pickup: { label: 'Awaiting pickup', cls: 'bg-brand/15 text-brand' },
  in_transit: { label: 'In transit', cls: 'bg-warning/15 text-warning' },
  seller_approved: { label: 'Routed to buyer', cls: 'bg-success/15 text-success' },
  deal_completed: { label: 'Deal closed', cls: 'bg-success/20 text-success' },
  processed: { label: 'Processed', cls: 'bg-success/15 text-success' },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

export default function SellerReturnsPage() {
  const [returns, setReturns] = useState<SubmittedReturn[]>([]);

  useEffect(() => {
    setReturns(getSubmittedReturns());
  }, []);

  return (
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Returns
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Returns queue</h1>
      <p className="mt-2 text-muted-foreground">
        AI-graded at the doorstep — routed before the item moves.
      </p>

      <div className="mt-8 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/60">
            <tr>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                Return ID
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                Item
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                Grade
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                Routed path
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                Status
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                Submitted
              </th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => {
              const decisionKey = r.routingDecision?.decision;
              const decision = decisionKey ? DECISION_STYLE[decisionKey] : null;
              const grade = r.gradingResult?.grade;
              const gradeCls = grade ? GRADE_STYLE[grade] : 'bg-secondary text-muted-foreground';
              const status = STATUS_STYLE[r.status];

              return (
                <tr
                  key={r.returnId}
                  className="border-t border-border transition-colors hover:bg-secondary/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/seller/returns/${r.returnId}`}
                      className="font-mono text-brand hover:underline"
                    >
                      {r.returnId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.productName}</p>
                    <p className="text-xs text-muted-foreground">{formatPrice(r.priceCents)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {grade ? (
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${gradeCls}`}>
                        Grade {grade}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {decision ? (
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${decision.cls}`}>
                        {decision.label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${status.cls}`}>
                      {status.dot && (
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                      )}
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {timeAgo(r.submittedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {returns.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No returns yet.
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Click any return ID to see the full AI grading report and routing decision.
      </p>
    </div>
  );
}
