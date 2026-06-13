'use client';

import { useState } from 'react';
import Image from 'next/image';
import { demoItems, type DemoItem } from '@/mock/demo-items';

interface SamplePickerProps {
  /** Loads the sample into the capture state (compress + set). */
  onSelect: (item: DemoItem) => Promise<void>;
  disabled?: boolean;
}

export function SamplePicker({ onSelect, disabled }: SamplePickerProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handle(item: DemoItem) {
    if (disabled || loadingId) return;
    setLoadingId(item.id);
    try {
      await onSelect(item);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-brand">Try a sample item</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {demoItems.map((item) => {
          const isLoading = loadingId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handle(item)}
              disabled={disabled || loadingId !== null}
              className="group flex w-28 flex-col items-center gap-2 rounded-xl border border-border bg-card p-2 text-center transition-all hover:-translate-y-0.5 hover:border-brand/50 disabled:opacity-50"
            >
              <span className="relative h-16 w-full overflow-hidden rounded-lg bg-background">
                <Image
                  src={item.imagePaths[0] ?? ''}
                  alt={item.title}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
                {isLoading && (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/70 font-mono text-[10px] uppercase tracking-widest text-brand backdrop-blur">
                    Loading…
                  </span>
                )}
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground group-hover:text-foreground">
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
