'use client';

import { useState } from 'react';
import type { MockOrder, ReturnReason } from '@reloop/shared';
import { captureSpecFor, requiredAngles } from '@reloop/shared';
import { compressFile } from '@/lib/image';
import { Card } from '@/components/ui/card';
import { ProductThumb } from './ProductThumb';
import { CameraIcon, CheckIcon, ArrowRightIcon } from './icons';

/** One captured angle: which angle it is + its data-URL preview. */
export interface CapturedAngle {
  angle: string;
  dataUrl: string;
}

interface Props {
  order: MockOrder;
  onSubmit: (reason: ReturnReason, images: CapturedAngle[]) => void;
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

function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function BuyerStep1({ order, onSubmit }: Props) {
  const [reason, setReason] = useState<ReturnReason | null>(null);
  // angleId -> data-URL. The capture spec is driven by the item's category so
  // the grader gets the angles it was trained to diagnose (spec 025).
  const [photos, setPhotos] = useState<Record<string, string>>({});

  const spec = captureSpecFor(order.category);
  const required = requiredAngles(order.category);
  const capturedCount = Object.keys(photos).length;
  const missingRequired = required.filter((id) => !photos[id]);

  async function setAngle(angleId: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    // Compress to a small base64 JPEG (≤~160KB) so it fits localStorage's quota.
    try {
      const { dataUrl } = await compressFile(file);
      setPhotos((prev) => ({ ...prev, [angleId]: dataUrl }));
    } catch {
      /* ignore a single bad file */
    }
  }

  function clearAngle(angleId: string) {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[angleId];
      return next;
    });
  }

  function handleSubmit() {
    if (!reason) return;
    const images: CapturedAngle[] = spec
      .filter((a) => photos[a.id])
      .map((a) => ({ angle: a.id, dataUrl: photos[a.id]! }));
    onSubmit(reason, images);
  }

  return (
    <div className="space-y-5">
      {/* Order card */}
      <Card>
        <div className="flex items-center gap-4">
          <ProductThumb name={order.productName} imageUrl={order.imageUrl} sizeClassName="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{order.productName}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Order #{order.orderId}
            </p>
            <p className="text-sm text-muted-foreground">Ordered {formatDate(order.orderDate)}</p>
          </div>
          <p className="flex-shrink-0 font-semibold text-foreground">{formatPrice(order.priceCents)}</p>
        </div>
      </Card>

      {/* Reason */}
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Reason for return</p>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">Why are you returning this item?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {REASONS.map(({ value, label }) => {
            const selected = reason === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-all ${
                  selected
                    ? 'border-brand bg-brand/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-brand/50 hover:text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={selected}
                  onChange={() => setReason(value)}
                  className="sr-only"
                />
                <span
                  className={`grid size-5 flex-shrink-0 place-items-center rounded-full border transition-colors ${
                    selected ? 'border-brand bg-brand text-brand-foreground' : 'border-border'
                  }`}
                >
                  {selected && <CheckIcon className="h-3 w-3" />}
                </span>
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </Card>

      {/* Angle-guided photo capture — the AI grader asks for specific angles */}
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Photos for AI grading</p>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Add a photo for each angle so the AI can grade this item before pickup. Angles marked{' '}
          <span className="font-semibold text-brand">Required</span> matter most — skip them and
          we&apos;ll capture them at your doorstep instead.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {spec.map((angle) => {
            const url = photos[angle.id];
            const inputId = `angle-${angle.id}`;
            return (
              <div
                key={angle.id}
                className={`rounded-xl border p-3 transition-colors ${
                  url
                    ? 'border-brand/40 bg-brand/5'
                    : angle.required
                      ? 'border-brand/30'
                      : 'border-border'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{angle.label}</span>
                  <span
                    className={`font-mono text-[9px] uppercase tracking-widest ${
                      angle.required ? 'text-brand' : 'text-muted-foreground'
                    }`}
                  >
                    {angle.required ? 'Required' : 'Optional'}
                  </span>
                </div>

                <label
                  htmlFor={inputId}
                  className="group relative block aspect-square cursor-pointer overflow-hidden rounded-lg border border-dashed border-border bg-background transition-colors hover:border-brand/50"
                >
                  {url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${angle.label} photo`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          clearAngle(angle.id);
                        }}
                        aria-label={`Remove ${angle.label} photo`}
                        className="absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background hover:text-brand"
                      >
                        <span className="text-xs leading-none">✕</span>
                      </button>
                      <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-brand text-brand-foreground">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    </>
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors group-hover:text-brand">
                      <CameraIcon className="h-5 w-5" />
                      <span className="text-[10px]">Add photo</span>
                    </span>
                  )}
                  <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void setAngle(angle.id, e.target.files)}
                  />
                </label>

                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{angle.diagnostic}</p>
              </div>
            );
          })}
        </div>

        {/* Live capture guidance */}
        {capturedCount > 0 && missingRequired.length > 0 && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="text-sm text-warning">
              Missing required{' '}
              {missingRequired.length === 1 ? 'angle' : 'angles'}:{' '}
              <span className="font-semibold">
                {spec.filter((a) => missingRequired.includes(a.id)).map((a) => a.label).join(', ')}
              </span>
              . Add {missingRequired.length === 1 ? 'it' : 'them'} for an instant grade, or continue
              and we&apos;ll capture {missingRequired.length === 1 ? 'it' : 'them'} at pickup.
            </p>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!reason}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground ring-1 ring-brand/50 transition-all hover:bg-brand-strong hover:shadow-[0_0_30px_rgba(234,179,8,0.25)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
        >
          Submit return
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
