'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  estimateImpact,
  type GradingResult,
  type ImpactEstimate,
  type OwnedItem,
  type PricingResult,
  type ProductHealthCard,
} from '@reloop/shared';
import type { CompressedImage } from '@/lib/image';
import { ApiRequestError, createHealthCard, gradeItem, priceItem } from '@/lib/api-client';
import { addListing } from '@/lib/listings-store';
import { earnSeller } from '@/lib/credits-store';
import { useRole } from '@/lib/role-context';
import { PageShell } from '@/components/layout/page-shell';
import { DetailStep } from './detail-step';
import { CaptureStep } from './capture-step';
import { ProcessingStep, type Stage } from './processing-step';
import { ReviewStep } from './review-step';
import { ConfirmedStep } from './confirmed-step';

type Phase = 'detail' | 'capture' | 'processing' | 'review' | 'confirmed';

const PHASE_TITLE: Record<Phase, { eyebrow: string; title: string; description?: string }> = {
  detail: { eyebrow: 'Sell · Step 01 · Item', title: 'Sell this item' },
  capture: {
    eyebrow: 'Sell · Step 02 · Capture',
    title: 'Show us the item',
    description: "Add a few photos. We'll grade the condition and check it against the original listing.",
  },
  processing: { eyebrow: 'Sell · Step 03 · Inspection', title: 'Inspecting your item' },
  review: {
    eyebrow: 'Sell · Step 04 · Review',
    title: 'Review & confirm',
    description: 'Here’s what the AI found — and what your item is worth for a second life.',
  },
  confirmed: { eyebrow: 'Sell · Complete', title: 'Listed for a second life' },
};

function errText(e: unknown, fallback: string): string {
  return e instanceof ApiRequestError ? e.message : fallback;
}

export function SellSession({ item }: { item: OwnedItem }) {
  const router = useRouter();
  const { account } = useRole();
  const [phase, setPhase] = useState<Phase>('detail');
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [stage, setStage] = useState<Stage>('grading');
  const [failedStage, setFailedStage] = useState<Stage | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [grading, setGrading] = useState<GradingResult | null>(null);
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [card, setCard] = useState<ProductHealthCard | null>(null);
  const [impact, setImpact] = useState<ImpactEstimate | null>(null);

  const run = useCallback(
    async (imgs: CompressedImage[]) => {
      setPhase('processing');
      setFailedStage(null);
      setErrorMsg('');
      const draft = { title: item.title, category: item.category, notes: item.description };

      // 1. Grade (one reliable call; server loops photos sequentially) + reference diff.
      setStage('grading');
      let g: GradingResult;
      try {
        g = await gradeItem({
          draft,
          imagesBase64: imgs.map((i) => i.base64),
          reference: {
            originalListingImages: item.originalListingImages,
            originalSpecs: item.originalSpecs,
          },
        });
        setGrading(g);
      } catch (e) {
        setFailedStage('grading');
        setErrorMsg(errText(e, 'We couldn’t grade these photos. Please try again.'));
        return;
      }

      // 2. Price (logic decides, LLM narrates).
      setStage('pricing');
      let p: PricingResult;
      try {
        p = await priceItem({ draft, grade: g.grade, detectedIssues: g.detectedIssues });
        setPricing(p);
      } catch (e) {
        setFailedStage('pricing');
        setErrorMsg(errText(e, 'We couldn’t price this item. Please try again.'));
        return;
      }

      // 3. Health Card (pure assembly).
      setStage('card');
      try {
        const c = await createHealthCard({ draft, grading: g, pricing: p });
        setCard(c);
      } catch (e) {
        setFailedStage('card');
        setErrorMsg(errText(e, 'We couldn’t assemble the Health Card. Please try again.'));
        return;
      }

      // 4. Impact (derived, deterministic).
      setImpact(estimateImpact(item.category, p.suggestedPrice));
      setStage('done');
      setPhase('review');
    },
    [item],
  );

  function onStart(imgs: CompressedImage[]) {
    setImages(imgs);
    void run(imgs);
  }

  function onConfirm() {
    const listed = pricing?.suggestedPrice ?? item.originalPrice;
    const retailCents = pricing?.estimatedRetail.amountCents ?? Math.round(listed.amountCents / 0.55);
    addListing({
      id: `lst_${Date.now()}`,
      title: item.title,
      imageUrl: images[0]?.dataUrl ?? item.imageUrl,
      listedPrice: listed,
      status: 'listed',
      views: 0,
      listedAt: new Date().toISOString(),
      // Whose listing this is — drives My Listings + who gets paid on sale.
      sellerId: account?.id,
      sellerName: account?.name,
      // Shop-rendering data so other users can buy it.
      originalPrice: item.originalPrice,
      card: card ?? undefined,
      impact: impact ?? undefined,
      // Agent metadata so the Listing Agent can reason over this real listing.
      category: item.category,
      grade: grading?.grade,
      floorCents: Math.round(listed.amountCents * 0.55),
      retailCents,
      market: {
        comparableCents: Math.round(listed.amountCents * 0.85),
        localDemand: pricing?.demand ?? 'medium',
        holdingCostPerDayCents: Math.max(2000, Math.round(listed.amountCents * 0.01)),
        baseViewsPerDay: 6,
      },
    });
    // Seller earns EcoCredits for diverting the item from landfill.
    if (impact) earnSeller(impact.ecoCredits, `Listed ${item.title}`);
    setPhase('confirmed');
  }

  const header = PHASE_TITLE[phase];

  return (
    <PageShell eyebrow={header.eyebrow} title={header.title} description={header.description}>
      {phase === 'detail' && <DetailStep item={item} onStart={() => setPhase('capture')} />}

      {phase === 'capture' && <CaptureStep item={item} onStart={onStart} />}

      {phase === 'processing' && (
        <ProcessingStep
          stage={stage}
          failedStage={failedStage}
          errorMsg={errorMsg}
          photos={images}
          onRetry={() => void run(images)}
          onBack={() => setPhase('capture')}
        />
      )}

      {phase === 'review' && grading && pricing && card && impact && (
        <ReviewStep
          item={item}
          grading={grading}
          pricing={pricing}
          card={card}
          impact={impact}
          userPhotos={images}
          onConfirm={onConfirm}
        />
      )}

      {phase === 'confirmed' && (
        <ConfirmedStep
          item={item}
          card={card}
          impact={impact}
          onViewListings={() => router.push('/app/listings')}
        />
      )}
    </PageShell>
  );
}
