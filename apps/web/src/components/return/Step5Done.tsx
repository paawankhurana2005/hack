'use client';

import { useEffect } from 'react';
import type { MockOrder, ReturnFlowState, ReturnRoutingDecision } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { earnSeller } from '@/lib/credits-store';

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
  restock:
    'Sealed and verified — this item goes straight back to sellable inventory at the nearest fulfilment centre, skipping the returns centre entirely.',
  local_resale:
    'Amazon matched this item to a verified buyer nearby. It will be handed off locally — no 600km warehouse trip.',
  refurbish:
    'This item is going to a certified local refurbishment partner. Once restored, it will be relisted.',
  liquidate:
    'This item joins a graded, Health-Card-manifested pallet at your local hub — sold to a verified bulk buyer, no long-haul trip.',
  donate:
    'This item will be donated to a verified local charity partner. It stays in the community.',
  recycle:
    'This item will be responsibly recycled at a certified local facility. Zero landfill.',
  warehouse:
    'No local match was found. Your item is being processed at our returns centre.',
  return_to_seller:
    'Your item is being returned to the seller per their policy.',
  returnless_refund:
    'Keep the item — no pickup needed. Every return route costs more than it recovers, so your refund is issued and nothing moves.',
};

// Spec 016: the final leg of the journey strip, per destination.
const ITEM_JOURNEY_END: Record<ReturnRoutingDecision['decision'], string> = {
  restock: 'Back on the shelf',
  local_resale: 'Handed to a nearby buyer',
  refurbish: 'Refurb partner',
  liquidate: 'Manifested pallet → verified bulk buyer',
  donate: 'Charity partner',
  recycle: 'Certified recycler',
  warehouse: 'Returns centre',
  return_to_seller: 'Back to the seller',
  returnless_refund: 'Stays with you',
};

// What the seller gains — shown for local routes where the seller benefits.
const SELLER_BENEFIT: Partial<Record<ReturnRoutingDecision['decision'], string>> = {
  local_resale:
    'The seller has been notified. Local routing saves them the cost of a warehouse round-trip.',
  refurbish:
    'The seller has been notified. Local refurbishment recovers more value than a warehouse return.',
  donate:
    'The seller has been notified. Local donation avoids warehouse handling costs.',
  liquidate:
    'The seller has been notified. Graded, manifested pallets recover far more than unmanifested FC liquidation.',
};

export function Step5Done({ flowState, order }: Props) {
  const decision = flowState.routingDecision?.decision ?? 'warehouse';
  const co2 = flowState.routingDecision?.co2SavedKg ?? 0;
  const showCo2 = co2 > 0;
  const showHealthCard = decision === 'local_resale' || decision === 'refurbish';
  const sellerBenefit = SELLER_BENEFIT[decision];
  const voucherEcoCredits = flowState.routingDecision?.voucherEcoCredits ?? 0;

  // Award once per return — the idempotency key (not the mount itself) is what
  // guards against double-crediting on a remount/refresh of this screen.
  useEffect(() => {
    if (voucherEcoCredits > 0) {
      earnSeller(
        voucherEcoCredits,
        `Return routed to ${decision.replace('_', ' ')} — carbon avoided`,
        `return:${order.orderId}:${decision}`,
      );
    }
  }, [order.orderId, decision, voucherEcoCredits]);

  return (
    <div className="space-y-5">
      {/* Refund confirmation */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-success/20">
            <span className="text-success text-lg">✓</span>
          </div>
          <div>
            <p className="font-semibold text-foreground">Return confirmed — refund processing</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your refund of{' '}
              <span className="font-semibold text-foreground">{formatPrice(order.priceCents)}</span> is
              on its way. Expected by{' '}
              <span className="text-foreground">{refundByDate()}</span>.
            </p>
          </div>
        </div>
      </Card>

      {/* What happens to the item */}
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">What happens next</p>
        <p className="mt-2 text-foreground">{ITEM_DESTINATION[decision]}</p>

        {/* Spec 016: the journey ahead — decided now, verified at two checkpoints */}
        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-3">
          {[
            'Routed at your doorstep',
            'Driver scan at pickup',
            'Local hub check (~10 min)',
            ITEM_JOURNEY_END[decision],
          ].map((stage, i) => (
            <div key={stage} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                  i === 0 ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {stage}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          The route was decided before your item moves — and it's re-checked at each step while a
          change is still cheap. Your refund is never affected by re-routing.
        </p>
      </Card>

      {/* Seller notification — local routes only */}
      {sellerBenefit && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-sm">
            📬
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Seller notified</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{sellerBenefit}</p>
          </div>
        </div>
      )}

      {/* CO₂ savings + EcoCredits earned */}
      {showCo2 && (
        <div className="rounded-lg border border-success/30 bg-success/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌿</span>
              <div>
                <p className="font-semibold text-success">{co2}kg of CO₂ avoided</p>
                <p className="text-xs text-muted-foreground">vs. a warehouse round-trip for this item</p>
              </div>
            </div>
            {voucherEcoCredits > 0 && (
              <span className="whitespace-nowrap font-mono text-sm font-semibold text-brand">
                +{voucherEcoCredits} EcoCredits
              </span>
            )}
          </div>
          {voucherEcoCredits > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Avoided emissions, estimated from category + routing data, counted toward Amazon's Climate
              Pledge — not a traded carbon credit.
            </p>
          )}
        </div>
      )}

      {/* Product Health Card — local_resale and refurbish */}
      {showHealthCard && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-lg">
              🔒
            </div>
            <div>
              <p className="font-semibold text-foreground">Product Health Card created</p>
              <p className="mt-1 text-sm text-muted-foreground">
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
          className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-strong"
        >
          Return to Orders
        </a>
      </div>
    </div>
  );
}
