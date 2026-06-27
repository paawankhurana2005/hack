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
import { reviewDecision } from '@reloop/shared';
import { addListing } from '@/lib/listings-store';
import { earnSeller } from '@/lib/credits-store';
import { enqueueReview } from '@/lib/review-queue';
import { appendEvent, baseChain } from '@/lib/provenance-store';
import { uploadImage } from '@/lib/data-api';
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

      // DEMO HARDCODE — the Under Armour Charged pair grades to a fixed, scripted
      // result so the live demo is deterministic: ~5s "scanning", then a Fair
      // grade and a ₹3,750 price (a few-seasons-old pair). Remove this branch to
      // restore the real AI grading pipeline for this item.
      if (item.itemId === 'itm_ua_charged') {
        setStage('grading');
        await new Promise((r) => setTimeout(r, 5000)); // 5s on-screen scan
        const now = new Date().toISOString();
        const g: GradingResult = {
          id: `grd_${Date.now()}`,
          productId: item.itemId,
          grade: 'fair',
          confidence: 0.9,
          detectedIssues: [
            'Visible creasing across the toe box',
            'Outsole tread worn down at the heel',
            'Light discolouration on the white mesh upper',
          ],
          summary: 'Well-worn but structurally sound — a few seasons of use, with plenty of life left.',
          photoUrls: imgs.map((i) => i.dataUrl),
          referenceComparison: {
            authenticityMatch: true,
            authenticityConfidence: 0.96,
            changedFromOriginal: [
              'Upper mesh dulled vs factory white',
              'Midsole compression at the heel strike',
            ],
            gradeImpact:
              'Confirmed genuine Under Armour Charged Assert — the wear is cosmetic, so it grades Fair rather than Good.',
            specMatches: [
              { label: 'Color', expected: 'White / Black', observed: 'White / Black', match: true },
              { label: 'Size', expected: 'US 10', observed: 'US 10', match: true },
            ],
            source: 'mock',
          },
          gradedAt: now,
        };
        setGrading(g);

        setStage('pricing');
        const p: PricingResult = {
          id: `prc_${Date.now()}`,
          productId: item.itemId,
          grade: 'fair',
          estimatedRetail: { amountCents: 699900, currency: 'INR' }, // ₹6,999 new
          suggestedPrice: { amountCents: 375000, currency: 'INR' }, // ₹3,750
          discountPct: 0.46,
          demand: 'medium',
          rationale:
            'Fair-condition Charged Asserts in this colourway resell around ₹3,500–4,000. ₹3,750 sits mid-band — competitive for a few-seasons-old pair while still recovering strong value.',
          factors: [
            { label: 'Condition', value: 'Fair · visible wear' },
            { label: 'Original retail', value: '₹6,999' },
            { label: 'Local demand', value: 'Medium' },
            { label: 'Comparable resale', value: '₹3,500–4,000' },
          ],
          pricedAt: now,
        };
        setPricing(p);

        setStage('card');
        try {
          const c = await createHealthCard({ draft, grading: g, pricing: p });
          setCard({ ...c, itemId: item.itemId });
        } catch (e) {
          setFailedStage('card');
          setErrorMsg(errText(e, 'We couldn’t assemble the Health Card. Please try again.'));
          return;
        }
        setImpact(estimateImpact(item.category, p.suggestedPrice));
        setStage('done');
        setPhase('review');
        return;
      }

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

      // 2. Price — anchored to the original Amazon listing (base reference) so the
      //    resale-ratio model can price from real condition/age/demand features.
      setStage('pricing');
      let p: PricingResult;
      try {
        p = await priceItem({
          draft,
          grade: g.grade,
          detectedIssues: g.detectedIssues,
          reference: {
            originalRetailCents: item.originalPrice.amountCents,
            purchaseDate: item.purchaseDate,
          },
          structuredIssues: g.structuredIssues,
          authenticityConfidence: g.referenceComparison?.authenticityConfidence,
        });
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
        // Bind the card to the PHYSICAL item so re-listing appends to the same
        // provenance chain instead of starting a fresh one.
        setCard({ ...c, itemId: item.itemId });
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

    // Persist the as-graded photos to S3 (best-effort, fire-and-forget). The listing
    // already renders the local image, so this genuinely fills the S3 bucket without
    // ever blocking or breaking the flow.
    const ts = Date.now();
    images.forEach((img, i) => {
      void uploadImage(`grading/${item.itemId}/${ts}-${i}.jpg`, img.dataUrl);
    });

    addListing({
      id: `lst_${Date.now()}`,
      itemId: item.itemId,
      title: item.title,
      imageUrl: images[0]?.dataUrl ?? item.imageUrl,
      listedPrice: listed,
      status: 'listed',
      views: 0,
      listedAt: new Date().toISOString(),
      // Whose listing this is — drives My Listings + who gets paid on sale.
      sellerId: account?.id,
      sellerName: account?.name,
      sourceItemId: item.id,
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
    // Seller earns EcoCredits for diverting the item from landfill. Idempotent on the
    // physical item + listing price so a retry / re-render never double-credits.
    if (impact) earnSeller(impact.ecoCredits, `Listed ${item.title}`, `list:${item.itemId}:${listed.amountCents}`);

    // Human-in-the-loop: if the AI wasn't confident (or the item is risky), queue it
    // for review rather than trusting the grade outright.
    const review = reviewDecision({
      calibratedConfidence: grading?.confidence,
      valueCents: listed.amountCents,
      authenticityMatch: grading?.referenceComparison?.authenticityMatch,
    });
    if (review.needsReview) {
      enqueueReview({
        id: `rev:${item.itemId}`,
        itemId: item.itemId,
        title: item.title,
        reasons: review.reasons,
        proposedGrade: grading?.grade,
        proposedPriceCents: listed.amountCents,
      });
    }

    // Provenance: append this life's grade + listing to the item's chain. For a
    // re-listed item (e.g. the staged demo item) this lands on top of its existing
    // history — both grades stay. `baseChain` only seeds origin+owned when the
    // item has no chain yet (a first-ever listing), so nothing is duplicated.
    const now = new Date().toISOString();
    const fallback = baseChain(item.itemId, {
      category: item.category,
      title: item.title,
      ownerName: account?.name ?? 'Owner',
      at: item.purchaseDate,
    });
    if (grading) {
      appendEvent(
        item.itemId,
        {
          type: 'graded',
          at: grading.gradedAt,
          verified: card?.authenticityVerified ?? false,
          grade: grading.grade,
          confidence: grading.confidence,
          issues: grading.detectedIssues,
          referenceMatch: grading.referenceComparison?.authenticityMatch,
        },
        fallback,
      );
    }
    appendEvent(
      item.itemId,
      { type: 'listed', at: now, verified: true, price: listed },
      fallback,
    );

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
