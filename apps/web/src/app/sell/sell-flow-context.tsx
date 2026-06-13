'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type {
  GradingResult,
  ItemCategory,
  PricingResult,
  ProductHealthCard,
} from '@reloop/shared';
import type { CompressedImage } from '@/lib/image';

export interface SellDraft {
  title: string;
  category: ItemCategory;
  notes: string;
}

const emptyDraft: SellDraft = { title: '', category: 'electronics', notes: '' };

interface SellFlowValue {
  draft: SellDraft;
  setDraft: (draft: SellDraft) => void;
  images: CompressedImage[];
  setImages: (images: CompressedImage[]) => void;
  result: GradingResult | null;
  setResult: (result: GradingResult | null) => void;
  pricing: PricingResult | null;
  setPricing: (pricing: PricingResult | null) => void;
  card: ProductHealthCard | null;
  setCard: (card: ProductHealthCard | null) => void;
  reset: () => void;
}

const SellFlowContext = createContext<SellFlowValue | null>(null);

export function SellFlowProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<SellDraft>(emptyDraft);
  const [images, setImages] = useState<CompressedImage[]>([]);

  // Pre-seed from "My Items" (sessionStorage) once on mount, if present. Reading
  // post-mount (not in the initializer) avoids any hydration mismatch.
  useEffect(() => {
    const raw = window.sessionStorage.getItem('reloop.sellSeed');
    if (!raw) return;
    window.sessionStorage.removeItem('reloop.sellSeed');
    try {
      const seed = JSON.parse(raw) as Partial<SellDraft>;
      setDraft({
        title: seed.title ?? '',
        category: (seed.category as ItemCategory) ?? 'electronics',
        notes: seed.notes ?? '',
      });
    } catch {
      /* malformed seed — ignore, keep empty draft */
    }
  }, []);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [card, setCard] = useState<ProductHealthCard | null>(null);

  const value = useMemo<SellFlowValue>(
    () => ({
      draft,
      setDraft,
      images,
      setImages,
      result,
      setResult,
      pricing,
      setPricing,
      card,
      setCard,
      reset: () => {
        setDraft(emptyDraft);
        setImages([]);
        setResult(null);
        setPricing(null);
        setCard(null);
      },
    }),
    [draft, images, result, pricing, card],
  );

  return <SellFlowContext.Provider value={value}>{children}</SellFlowContext.Provider>;
}

export function useSellFlow(): SellFlowValue {
  const ctx = useContext(SellFlowContext);
  if (!ctx) throw new Error('useSellFlow must be used within SellFlowProvider');
  return ctx;
}
