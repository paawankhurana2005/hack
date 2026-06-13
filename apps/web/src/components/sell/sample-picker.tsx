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
      <p className="text-sm font-medium text-muted">Try a sample item</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {demoItems.map((item) => {
          const isLoading = loadingId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handle(item)}
              disabled={disabled || loadingId !== null}
              className="group flex w-28 flex-col items-center gap-2 rounded-md border border-navy-600 bg-navy-800 p-2 text-center transition-colors hover:border-orange-500 disabled:opacity-50"
            >
              <span className="relative h-16 w-full overflow-hidden rounded-sm bg-navy-900">
                <Image
                  src={item.imagePaths[0] ?? ''}
                  alt={item.title}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
                {isLoading && (
                  <span className="absolute inset-0 flex items-center justify-center bg-navy-900/70 text-xs text-orange-500">
                    Loading…
                  </span>
                )}
              </span>
              <span className="line-clamp-2 text-xs text-muted group-hover:text-white">
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
