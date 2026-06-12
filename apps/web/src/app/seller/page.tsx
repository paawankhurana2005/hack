import { Stat } from '@/components/ui/stat';
import { Placeholder } from '@/components/placeholder';

export default function SellerOverviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-white">Overview</h1>
      <p className="mt-2 text-muted">Returns handled at volume, at a glance.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Items in second life" value="1,284" hint="+12% this week" />
        <Stat label="Value recovered" value="$38.6k" hint="vs. warehouse write-off" />
        <Stat label="CO₂ saved" value="2.1t" hint="avoided round-trips" />
      </div>

      <div className="mt-8">
        <Placeholder
          spec="007"
          willDo="Render live seller KPIs from real routing outcomes — recovery rate, path mix, and carbon impact."
        />
      </div>
    </div>
  );
}
