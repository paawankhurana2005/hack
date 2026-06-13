'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ItemCategory } from '@reloop/shared';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SamplePicker } from '@/components/sell/sample-picker';
import { compressFile, compressUrl, type CompressedImage } from '@/lib/image';
import { useSellFlow } from './sell-flow-context';
import type { DemoItem } from '@/mock/demo-items';

const MAX_IMAGES = 4;

const categories: ItemCategory[] = [
  'electronics',
  'home',
  'fashion',
  'sports',
  'toys',
  'books',
  'other',
];

export default function SellIntentPage() {
  const router = useRouter();
  const { draft, setDraft, images, setImages, setResult } = useSellFlow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const room = Math.max(0, MAX_IMAGES - images.length);
    if (room === 0) {
      setError(`Photo limit reached (max ${MAX_IMAGES}). Remove one to add more.`);
      return;
    }

    setBusy(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const settled = await Promise.allSettled(picked.map((f) => compressFile(f)));
      const ok: CompressedImage[] = [];
      let failed = 0;
      for (const r of settled) {
        if (r.status === 'fulfilled') ok.push(r.value);
        else {
          failed += 1;
          // eslint-disable-next-line no-console
          console.error('[reloop] image compress failed:', r.reason);
        }
      }
      if (ok.length > 0) setImages([...images, ...ok]);
      if (failed > 0) {
        setError(
          `${failed} photo(s) couldn't be read${ok.length ? ' — added the rest.' : '. Try a JPG/PNG.'}`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSample(item: DemoItem) {
    setError(null);
    setResult(null);
    const compressed = await Promise.all(
      item.imagePaths.slice(0, MAX_IMAGES).map((p) => compressUrl(p)),
    );
    setDraft({ title: item.title, category: item.category, notes: item.notes ?? '' });
    setImages(compressed);
  }

  function removeImage(index: number) {
    setImages(images.filter((_, i) => i !== index));
  }

  const canStart = draft.title.trim().length > 0 && images.length > 0 && !busy;

  function start() {
    if (!canStart) return;
    setResult(null);
    router.push('/sell/grading');
  }

  return (
    <PageShell
      title="What are you selling?"
      description="Add a few details and photos. We'll grade the condition with AI."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <SamplePicker onSelect={onSample} disabled={busy} />

          <div className="my-6 h-px bg-navy-700" />

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm text-muted">Title</span>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Wireless headphones"
                className="mt-1 w-full rounded-md border border-navy-600 bg-navy-900 px-3 py-2 text-white placeholder:text-navy-600 focus:border-orange-500 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm text-muted">Category</span>
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ItemCategory })}
                className="mt-1 w-full rounded-md border border-navy-600 bg-navy-900 px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-muted">Notes (optional)</span>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Anything the grader should know"
                rows={2}
                className="mt-1 w-full rounded-md border border-navy-600 bg-navy-900 px-3 py-2 text-white placeholder:text-navy-600 focus:border-orange-500 focus:outline-none"
              />
            </label>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-medium text-white">Photos</p>
          <p className="mt-1 text-xs text-muted">Up to {MAX_IMAGES}. Resized in your browser.</p>

          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-navy-600 bg-navy-900 px-4 py-6 text-sm text-muted transition-colors hover:border-orange-500 hover:text-orange-500">
            {images.length >= MAX_IMAGES ? 'Limit reached' : 'Add photos'}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy || images.length >= MAX_IMAGES}
              onChange={(e) => onFiles(e.target.files)}
            />
          </label>

          {images.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {images.map((img, i) => (
                <div key={img.dataUrl} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt={`Photo ${i + 1}`}
                    className="h-24 w-full rounded-sm object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 rounded-sm bg-navy-900/80 px-1.5 text-xs text-white hover:text-orange-500"
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <div className="mt-8 flex items-center justify-end">
        <Button variant="primary" onClick={start} disabled={!canStart}>
          {busy ? 'Processing photos…' : 'Start grading →'}
        </Button>
      </div>
    </PageShell>
  );
}
