'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface Props {
  productName: string;
  priceCents: number;
  agentWindow: string;
}

function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function refundByDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function BuyerStep3Done({ productName, priceCents, agentWindow }: Props) {
  return (
    <div className="space-y-5">
      {/* Success header */}
      <Card>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/20">
            <span className="text-3xl text-success">✓</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Return request submitted!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your {productName} return is confirmed. Here's what happens next.
          </p>
        </div>
      </Card>

      {/* Pickup */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/15 text-lg">
            🚚
          </div>
          <div>
            <p className="font-semibold text-foreground">Agent pickup today</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your Amazon delivery agent will arrive between{' '}
              <span className="font-semibold text-foreground">{agentWindow}</span>.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Keep your item packaged and ready at your registered address.
            </p>
          </div>
        </div>
      </Card>

      {/* Refund */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-success/15 text-lg">
            💳
          </div>
          <div>
            <p className="font-semibold text-foreground">
              Refund of{' '}
              <span className="text-brand">{formatPrice(priceCents)}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Initiated after agent pickup. Expected by{' '}
              <span className="text-foreground">{refundByDate()}</span>.
            </p>
          </div>
        </div>
      </Card>

      {/* What Amazon does with it — buyer-friendly framing */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <span className="mt-0.5 text-success">🌿</span>
        <p className="text-sm text-muted-foreground">
          Amazon will assess your item at the doorstep and find it the best next life — local resale,
          refurbishment, or donation — rather than a long warehouse trip.
        </p>
      </div>

      <div className="flex justify-end">
        <Link
          href="/home"
          className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
        >
          Back to Orders
        </Link>
      </div>
    </div>
  );
}
