'use client';

import type { MockOrder, ReturnFlowState, ReturnRoutingDecision } from '@reloop/shared';
import { Card } from '@/components/ui/card';

interface Props {
  flowState: ReturnFlowState;
  onNext: (partial: Partial<ReturnFlowState>) => void;
  order: MockOrder;
}

function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function refundByDate() {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// What happens to the item — framed as Amazon's action, not the user selling.
const ITEM_DESTINATION: Record<ReturnRoutingDecision['decision'], string> = {
  local_resale:
    'Amazon matched this item to a verified buyer nearby. It will be handed off locally — no 600km warehouse trip.',
  refurbish:
    'This item is going to a certified local refurbishment partner. Once restored, it will be relisted.',
  donate:
    'This item will be donated to a verified local charity partner. It stays in the community.',
  recycle:
    'This item will be responsibly recycled at a certified local facility. Zero landfill.',
  warehouse:
    'No local match was found. Your item is being processed at our returns centre.',
  return_to_seller:
    'Your item is being returned to the seller per their policy.',
};

// What the seller gains — shown for local routes where the seller benefits.
const SELLER_BENEFIT: Partial<Record<ReturnRoutingDecision['decision'], string>> = {
  local_resale:
    'The seller has been notified. Local routing saves them the cost of a warehouse round-trip.',
  refurbish:
    'The seller has been notified. Local refurbishment recovers more value than a warehouse return.',
  donate:
    'The seller has been notified. Local donation avoids warehouse handling costs.',
};

export function Step5Done({ flowState, order }: Props) {
  const decision = flowState.routingDecision?.decision ?? 'warehouse';
  const co2 = flowState.routingDecision?.co2SavedKg ?? 0;
  const showCo2 = co2 > 0;
  const showHealthCard = decision === 'local_resale' || decision === 'refurbish';
  const sellerBenefit = SELLER_BENEFIT[decision];

  return (
    <div className="space-y-5">
      {/* Refund confirmation */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-success/20">
            <span className="text-success text-lg">✓</span>
          </div>
          <div>
            <p className="font-semibold text-white">Return confirmed — refund processing</p>
            <p className="mt-1 text-sm text-muted">
              Your refund of{' '}
              <span className="font-semibold text-white">{formatPrice(order.priceCents)}</span> is
              on its way. Expected by{' '}
              <span className="text-white">{refundByDate()}</span>.
            </p>
          </div>
        </div>
      </Card>

      {/* What happens to the item */}
      <Card>
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">What happens next</p>
        <p className="mt-2 text-white">{ITEM_DESTINATION[decision]}</p>
      </Card>

      {/* Seller notification — local routes only */}
      {sellerBenefit && (
        <div className="flex items-start gap-3 rounded-lg border border-navy-600 bg-navy-800 p-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-navy-600 bg-navy-700 text-sm">
            📬
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Seller notified</p>
            <p className="mt-0.5 text-sm text-muted">{sellerBenefit}</p>
          </div>
        </div>
      )}

      {/* CO₂ savings */}
      {showCo2 && (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-5 py-4">
          <span className="text-2xl">🌿</span>
          <div>
            <p className="font-semibold text-success">{co2}kg of CO₂ avoided</p>
            <p className="text-xs text-muted">vs. a warehouse round-trip for this item</p>
          </div>
        </div>
      )}

      {/* Product Health Card — local_resale and refurbish */}
      {showHealthCard && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-navy-600 bg-navy-700 text-lg">
              🔒
            </div>
            <div>
              <p className="font-semibold text-white">Product Health Card created</p>
              <p className="mt-1 text-sm text-muted">
                A verified condition report has been created for{' '}
                {decision === 'refurbish' ? 'the refurbishment partner' : "the next owner"}.
                It records grade, defects, and authenticity check.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Return to Orders */}
      <div className="flex justify-end">
        <a
          href="/home"
          className="inline-flex items-center justify-center rounded-md bg-orange-500 px-6 py-2.5 text-sm font-semibold text-navy-900 hover:bg-orange-600"
        >
          Return to Orders
        </a>
      </div>
    </div>
  );
}
