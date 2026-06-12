import { Placeholder } from '@/components/placeholder';

export default function SellerInsightsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-white">Insights</h1>
      <p className="mt-2 text-muted">Trends across recovery, path mix, and prevented returns.</p>

      <div className="mt-8">
        <Placeholder
          spec="008"
          willDo="Surface analytics and return-prevention signals — the Prevention pillar predicting returns before they happen."
        />
      </div>
    </div>
  );
}
