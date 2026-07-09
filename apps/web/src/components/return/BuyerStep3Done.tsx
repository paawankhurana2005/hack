'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { CheckIcon, TruckIcon, CardIcon, LeafIcon, ArrowRightIcon } from './icons';

interface Props {
  productName: string;
  priceCents: number;
  agentWindow: string;
}

function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

// Pickup is 5–7 days out and the refund lands 5–7 business days after that, so
// the outer bound is ~14 days — never earlier than the agent actually collects.
function refundByDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function BuyerStep3Done({ productName, priceCents, agentWindow }: Props) {
  return (
    <div className="space-y-5">
      {/* Success header */}
      <Card>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-4 grid size-16 place-items-center rounded-full bg-brand/15 text-brand ring-1 ring-brand/25">
            <CheckIcon className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Return request submitted</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Your {productName} return is confirmed. Here's what happens next.
          </p>
        </div>
      </Card>

      {/* Pickup */}
      <Card>
        <div className="flex items-start gap-4">
          <span className="grid size-10 flex-shrink-0 place-items-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/20">
            <TruckIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-foreground">Agent pickup</p>
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
          <span className="grid size-10 flex-shrink-0 place-items-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/20">
            <CardIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-foreground">
              Refund of <span className="text-brand">{formatPrice(priceCents)}</span>
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
        <LeafIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
        <p className="text-sm text-muted-foreground">
          Amazon assesses your item at the doorstep and finds it the best next life — local resale,
          refurbishment, or donation — rather than a long warehouse trip.
        </p>
      </div>

      <div className="flex justify-end">
        <Link
          href="/app/items"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground ring-1 ring-brand/50 transition-all hover:bg-brand-strong hover:shadow-[0_0_30px_rgba(234,179,8,0.25)]"
        >
          Back to My Items
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
