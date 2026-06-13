'use client';

import { useState } from 'react';
import type { OwnedItem } from '@reloop/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { compressFile, type CompressedImage } from '@/lib/image';

const MAX_IMAGES = 4;

export function CaptureStep({
  item,
  onStart,
}: {
  item: OwnedItem;
  onStart: (images: CompressedImage[]) => void;
}) {
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');

  const busy = pending > 0;
  const total = images.length + pending;

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    const room = MAX_IMAGES - total;
    if (room <= 0) {
      setError(`That's the max (${MAX_IMAGES}). Remove one to add another.`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    setPending((n) => n + picked.length);
    for (const file of picked) {
      try {
        const compressed = await compressFile(file);
        setImages((prev) => [...prev, compressed]);
      } catch {
        setError("One photo couldn't be read — try a JPG or PNG.");
      } finally {
        setPending((n) => n - 1);
      }
    }
  }

  function remove(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Reference: what we're matching against */}
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
          Original listing · reference
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {item.originalListingImages.slice(0, 4).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={`Original ${i + 1}`}
              className="h-20 w-full rounded-lg object-cover ring-1 ring-border"
            />
          ))}
        </div>
        <div className="mt-4 space-y-px">
          {Object.entries(item.originalSpecs).map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-border/40 py-1.5"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {label}
              </span>
              <span className="font-mono text-xs text-foreground">{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          We&apos;ll diff your photos against these to verify it&apos;s the real product and spot any
          wear.
        </p>
      </Card>

      {/* Capture */}
      <Card>
        <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Your photos</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {total}/{MAX_IMAGES} · resized in your browser. More angles = a better grade.
        </p>

        <label
          className={`mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-brand ${
            total >= MAX_IMAGES ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {total >= MAX_IMAGES ? 'Limit reached' : busy ? 'Adding photos…' : 'Add photos'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={total >= MAX_IMAGES}
            onChange={(e) => void addFiles(e.target.files)}
          />
        </label>

        {(images.length > 0 || pending > 0) && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img, i) => (
              <div key={img.dataUrl} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={`Photo ${i + 1}`}
                  className="h-24 w-full rounded-lg object-cover ring-1 ring-border"
                />
                <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 font-mono text-[9px] uppercase tracking-widest text-brand backdrop-blur">
                  Ready
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute right-1 top-1 rounded-md bg-background/80 px-1.5 text-xs text-foreground backdrop-blur hover:text-brand"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}
            {Array.from({ length: pending }).map((_, i) => (
              <div
                key={`pending-${i}`}
                className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-background"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-brand" />
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex justify-end">
          <Button variant="primary" disabled={images.length === 0 || busy} onClick={() => onStart(images)}>
            Grade my item →
          </Button>
        </div>
      </Card>
    </div>
  );
}
