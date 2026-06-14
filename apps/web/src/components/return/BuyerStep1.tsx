'use client';

import { useState, useRef } from 'react';
import type { MockOrder, ReturnReason } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { ProductThumb } from './ProductThumb';
import { CameraIcon, CheckIcon, ArrowRightIcon } from './icons';

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

const MAX_PHOTOS = 5;

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
    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    void Promise.all(
      toAdd.map(
        (f) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(f);
          }),
      ),
    ).then((dataUrls) => setPhotos((prev) => [...prev, ...dataUrls]));
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  const full = photos.length >= MAX_PHOTOS;

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

      {/* Photo upload */}
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Photos of item</p>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Add a few clear photos to speed up AI grading at your doorstep — optional, up to {MAX_PHOTOS}.
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-disabled={full}
          onDragOver={(e) => {
            e.preventDefault();
            if (!full) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!full) addFiles(e.dataTransfer.files);
          }}
          onClick={() => !full && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !full) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            full
              ? 'cursor-not-allowed border-border opacity-60'
              : dragging
                ? 'cursor-pointer border-brand bg-brand/10'
                : 'cursor-pointer border-border hover:border-brand/50'
          }`}
        >
          <span className="grid size-11 place-items-center rounded-full bg-brand/15 text-brand ring-1 ring-brand/20">
            <CameraIcon className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">
            {full ? `Maximum ${MAX_PHOTOS} photos added` : 'Drag & drop photos, or click to browse'}
          </p>
          {!full && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              JPG or PNG · {photos.length}/{MAX_PHOTOS} added
            </p>
          )}
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
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((url, i) => (
              <div key={url} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Return photo ${i + 1}`}
                  className="h-20 w-full rounded-lg object-cover ring-1 ring-border"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePhoto(i);
                  }}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background hover:text-brand"
                >
                  <span className="text-xs leading-none">✕</span>
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
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground ring-1 ring-brand/50 transition-all hover:bg-brand-strong hover:shadow-[0_0_30px_rgba(234,179,8,0.25)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
        >
          Submit return
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
