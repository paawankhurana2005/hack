'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';

interface Props {
  /** The original photos the seller uploaded when the item was graded. */
  photos: string[];
  title: string;
  /** Optional grade label (e.g. "like-new") to show alongside the evidence. */
  grade?: string;
}

/**
 * "As-graded" photo gallery — the real, as-shot condition photos the seller
 * uploaded when the item was graded. This is the evidence behind the Product
 * Health Card: a buyer sees exactly what the AI assessed, not just the clean
 * marketplace image.
 */
export function GradedPhotos({ photos, title, grade }: Props) {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  if (photos.length === 0) return null;

  const total = photos.length;
  const safeIdx = Math.min(idx, total - 1);
  const prev = () => setIdx((i) => (i - 1 + total) % total);
  const next = () => setIdx((i) => (i + 1) % total);

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
              As-graded photos
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The original {total} photo{total !== 1 ? 's' : ''} the seller uploaded when this item
              was graded — the condition evidence behind its Health Card.
            </p>
          </div>
          {grade && (
            <span className="shrink-0 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-brand">
              Graded {grade}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          {/* Main image */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-background"
            aria-label="View full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[safeIdx]}
              alt={`${title} — as-graded photo ${safeIdx + 1} of ${total}`}
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
            <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white backdrop-blur-sm">
              Seller upload · {safeIdx + 1}/{total}
            </span>
            {total > 1 && (
              <>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      prev();
                    }
                  }}
                  className="absolute left-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                  aria-label="Previous photo"
                >
                  ‹
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      next();
                    }
                  }}
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                  aria-label="Next photo"
                >
                  ›
                </span>
              </>
            )}
          </button>

          {/* Thumbnails */}
          {total > 1 && (
            <div className="flex gap-2 sm:flex-col">
              {photos.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={`size-16 overflow-hidden rounded-lg border transition-colors ${
                    i === safeIdx ? 'border-brand' : 'border-border hover:border-brand/50'
                  }`}
                  aria-label={`Photo ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[safeIdx]}
            alt={`${title} — as-graded photo ${safeIdx + 1} of ${total}`}
            className="relative z-10 max-h-[90vh] max-w-[92vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
