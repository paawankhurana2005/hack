import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockRouting } from '@/mock/fixtures';

export default function ReturnBridgePage() {
  return (
    <PageShell
      title="Intelligent Bridge decision"
      description="The brain — a glass-box choice across resale, refurbish, donate, recycle, or warehouse."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Placeholder
          spec="004"
          willDo="Run the deterministic routing engine over {value, local cost, demand, carbon} and narrate the chosen path."
        />
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Chosen path</span>
            <Badge tone="accent">{mockRouting.chosenPath}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">{mockRouting.rationale}</p>
          <ul className="mt-4 space-y-1 text-sm text-muted">
            {mockRouting.factors.map((f) => (
              <li key={f.label} className="flex justify-between">
                <span>{f.label}</span>
                <span className="text-white">{f.value}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-success">
            Saves {mockRouting.carbonSavedKg}kg CO₂ vs. a warehouse round-trip
          </p>
        </Card>
      </div>
      <FlowNav prevHref="/return/grading" nextHref="/return/handoff" />
    </PageShell>
  );
}
