'use client';

import { useState, useRef } from 'react';
import type { MockOrder, ReturnReason } from '@reloop/shared';
import { Card } from '@/components/ui/card';

interface Props {
  order: MockOrder;
  onSubmit: (reason: ReturnReason, photos: string[]) => void;
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 5 - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    setPhotos((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-6">
      {/* Order card */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-brand/15 text-xl font-bold text-brand">
            {order.productName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{order.productName}</p>
            <p className="mt-1 text-sm text-muted-foreground">Order #{order.orderId}</p>
            <p className="text-sm text-muted-foreground">Ordered {formatDate(order.orderDate)}</p>
          </div>
          <p className="flex-shrink-0 font-semibold text-brand">{formatPrice(order.priceCents)}</p>
        </div>
      </Card>

      {/* Reason */}
      <Card>
        <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Why are you returning this item?
        </p>
        <div className="space-y-2">
          {REASONS.map(({ value, label }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                reason === value ? 'border-brand bg-brand/10' : 'border-border hover:border-brand/50'
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

      {/* Photo upload */}
      <Card>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Photos of item
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          Upload photos for faster AI grading at your doorstep (optional, up to 5).
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
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

        {photos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {photos.map((url, i) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-foreground"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!reason}
          onClick={() => reason && onSubmit(reason, photos)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit Return →
        </button>
      </div>
    </div>
  );
}
