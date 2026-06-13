'use client';

import { useState, useRef } from 'react';
import type { MockOrder, ReturnReason, ReturnFlowState, ReturnRoutingDecision } from '@reloop/shared';
import { Card } from '@/components/ui/card';

interface Props {
  flowState: ReturnFlowState;
  onNext: (partial: Partial<ReturnFlowState>) => void;
  order: MockOrder;
}

const REASONS: { value: ReturnReason; label: string }[] = [
  { value: 'didnt_fit', label: "Didn't fit" },
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'duplicate_gift', label: 'Received as a gift / duplicate' },
  { value: 'defective', label: 'Item is defective' },
  { value: 'stopped_working', label: 'Stopped working' },
  { value: 'arrived_damaged', label: 'Arrived damaged' },
  { value: 'wrong_item', label: 'Received wrong item' },
  { value: 'counterfeit', label: 'Suspected counterfeit' },
  { value: 'not_as_described', label: 'Not as described' },
];

const CATEGORY_COLORS: Record<MockOrder['category'], string> = {
  electronics: 'bg-brand/15 text-brand',
  apparel: 'bg-brand/15 text-brand',
  kitchenware: 'bg-brand/15 text-brand',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

const ESCALATION_SELLER: ReturnRoutingDecision = {
  decision: 'return_to_seller',
  reasoning: 'Escalated for seller review per Amazon policy. Your refund is protected.',
  co2SavedKg: 0,
  dwellBudgetHours: 0,
  sellerType: '3P',
  fallbackChain: [],
};

export function Step1Reason({ onNext, order }: Props) {
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEscalation = reason === 'counterfeit' || reason === 'not_as_described';
  const hasPhotos = photos.length > 0;

  function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 5 - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const urls = toAdd.map((f) => URL.createObjectURL(f));
    setPhotos((prev) => [...prev, ...urls]);
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    if (!reason) return;

    if (isEscalation) {
      onNext({ reason, photos, currentStep: 5, routingDecision: ESCALATION_SELLER });
      return;
    }

    if (!hasPhotos) {
      // No photos: skip visual grading, go straight to the Intelligent Bridge.
      // The bridge can still route based on category, value, and local demand
      // signals — avoiding an automatic warehouse trip for ungraded items.
      onNext({ reason, photos: [], currentStep: 3 });
      return;
    }

    onNext({ reason, photos, currentStep: 2 });
  }

  const ctaLabel = isEscalation
    ? 'Submit escalation'
    : !hasPhotos && reason
      ? 'Continue — item checked at pickup'
      : 'Continue';

  return (
    <div className="space-y-6">
      {/* Order summary */}
      <Card>
        <div className="flex items-start gap-4">
          <div
            className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg text-lg font-bold ${CATEGORY_COLORS[order.category]}`}
          >
            {order.productName[0]}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{order.productName}</p>
            <p className="mt-1 text-sm text-muted-foreground">Order #{order.orderId}</p>
            <p className="text-sm text-muted-foreground">Ordered {formatDate(order.orderDate)}</p>
            <p className="mt-1 text-sm font-semibold text-brand">{formatPrice(order.priceCents)}</p>
          </div>
        </div>
      </Card>

      {/* Reason selector */}
      <Card>
        <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Why are you returning this item?
        </p>
        <div className="space-y-2">
          {REASONS.map(({ value, label }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                reason === value
                  ? 'border-brand bg-brand/10'
                  : 'border-border hover:border-brand/50'
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="accent-brand"
              />
              <span className="text-sm text-foreground">{label}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* Inline alerts based on reason */}
      {reason === 'counterfeit' || reason === 'not_as_described' ? (
        <div className="rounded-lg border border-brand/40 bg-brand/10 p-4">
          <p className="text-sm text-brand">
            This return will be escalated for seller review. Your refund is protected.
          </p>
        </div>
      ) : reason === 'wrong_item' ? (
        <div className="rounded-lg border border-border bg-secondary p-4">
          <p className="text-sm text-muted-foreground">
            This item will be returned to inventory. Your refund is protected.
          </p>
        </div>
      ) : reason === 'arrived_damaged' ? (
        <div className="rounded-lg border border-border bg-secondary p-4">
          <p className="text-sm text-muted-foreground">
            A shipping claim will be opened on your behalf.
          </p>
        </div>
      ) : null}

      {/* Photo upload — hidden for escalation reasons */}
      {!isEscalation && (
        <Card>
          <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Photos (2–5)
          </p>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              dragging ? 'border-brand bg-brand/10' : 'border-border hover:border-brand/50'
            }`}
          >
            <span className="text-3xl">📷</span>
            <p className="mt-2 text-sm text-foreground">Drag & drop photos here</p>
            <p className="text-xs text-muted-foreground">or click to browse · max 5</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {/* Thumbnails */}
          {photos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {photos.map((url, i) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-foreground"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* No-photo warning */}
          {reason && !hasPhotos && (
            <p className="mt-4 text-sm text-muted-foreground">
              Without photos, your item will be graded at the warehouse. Your refund isn't affected.
            </p>
          )}
        </Card>
      )}

      {/* CTA */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!reason}
          onClick={handleSubmit}
          className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
