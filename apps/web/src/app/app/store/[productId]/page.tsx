'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReturnRiskPanel } from '@/components/store/return-risk-panel';
import { OpenBoxOfferCard } from '@/components/store/open-box-offer';
import { formatMoney } from '@/lib/money';
import { getReturnRisk } from '@/lib/prevention';
import { findStoreProduct } from '@/mock/store-products';

export default function StoreProductPage() {
  const params = useParams();
  const id = Array.isArray(params.productId)
    ? params.productId[0]!
    : (params.productId as string);
  const product = useMemo(() => findStoreProduct(id), [id]);

  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <PageShell eyebrow="Store" title="Product not found">
        <Card>
          <p className="text-sm text-muted-foreground">This product is no longer available.</p>
          <Link href="/app/store" className="mt-4 inline-flex text-sm font-medium text-brand">
            ← Back to Store
          </Link>
        </Card>
      </PageShell>
    );
  }

  const sized = !!product.sizes?.length;
  // Real classifier (authored labels take precedence) — extends prevention to every
  // sized product, not just the hero shoe.
  const prediction = size ? getReturnRisk(product.id, size) : null;

  // Map a recommendation's label (e.g. "Size 9") back to its size key.
  function switchTo(variantLabel: string) {
    const match = product!.sizes?.find(
      (s) => getReturnRisk(product!.id, s)?.variantLabel === variantLabel,
    );
    if (match) {
      setSize(match);
      setAdded(false);
    }
  }

  return (
    <PageShell eyebrow={`Store · ${product.brand}`} title={product.title}>
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        {/* Left: photo */}
        <Card className="overflow-hidden p-0">
          <div className="relative aspect-[4/3] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.title} className="h-full w-full object-contain p-8" />
          </div>
        </Card>

        {/* Right: buy panel */}
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              ★ {product.rating.toFixed(1)} · {product.ratingCount.toLocaleString('en-IN')} ratings
            </p>
            <p className="mt-3 text-4xl font-semibold tabular-nums text-brand">
              {formatMoney(product.price)}
            </p>
            {product.originalPrice && (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="line-through">{formatMoney(product.originalPrice)}</span> list price
              </p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">{product.description}</p>
          </div>

          {/* Spec 016: a doorstep-graded return of this exact product, nearby */}
          <OpenBoxOfferCard productId={product.id} newPriceCents={product.price.amountCents} />

          {sized && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Select size
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.sizes!.map((s) => {
                  const active = s === size;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSize(s);
                        setAdded(false);
                      }}
                      className={`size-11 rounded-lg border text-sm font-semibold tabular-nums transition ${
                        active
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border text-foreground hover:border-brand/60'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Return-Prevention nudge — appears the moment a size is chosen */}
          {prediction && (
            <ReturnRiskPanel key={size} prediction={prediction} onSwitch={switchTo} />
          )}

          {added ? (
            <Card className="ring-brand/40">
              <div className="flex items-center gap-3">
                <span className="grid size-9 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-sm text-brand">
                  ✓
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                    Added to cart
                  </p>
                  <p className="text-sm text-foreground">
                    {product.title}
                    {size ? ` · Size ${size}` : ''} — bought with confidence.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Button
              variant="primary"
              className="w-full"
              disabled={sized && !size}
              onClick={() => setAdded(true)}
            >
              {sized && !size ? 'Select a size to continue' : 'Add to cart'}
            </Button>
          )}
          <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Simulated checkout · demo
          </p>
        </div>
      </div>

      <div className="mt-8">
        <Link href="/app/store" className="text-sm font-medium text-brand hover:gap-1">
          ← Back to Store
        </Link>
      </div>
    </PageShell>
  );
}
