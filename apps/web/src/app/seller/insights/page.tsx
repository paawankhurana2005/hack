import { Placeholder } from '@/components/placeholder';

export default function SellerInsightsPage() {
  return (
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">Seller / Insights</span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Insights</h1>
      <p className="mt-2 text-muted-foreground">Trends across recovery, path mix, and prevented returns.</p>

      <div className="mt-8">
        <Placeholder
          spec="008"
          willDo="Surface analytics and return-prevention signals — the Prevention pillar predicting returns before they happen."
        />
      </div>
    </div>
  );
}
