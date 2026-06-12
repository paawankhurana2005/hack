import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockHealthCard } from '@/mock/fixtures';

export default function SellHealthCardPage() {
  return (
    <PageShell
      title="Product Health Card"
      description="The trust layer — verifiable condition, history, and authenticity that travels with the item."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Placeholder
          spec="005"
          willDo="Generate a shareable Product Health Card from the grade, authenticity check, and item history."
        />
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{mockHealthCard.title}</h2>
            {mockHealthCard.authenticityVerified && (
              <Badge tone="success">Verified</Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">Grade: {mockHealthCard.grade}</p>
          <ul className="mt-4 space-y-1 text-sm text-muted">
            {mockHealthCard.history.map((e) => (
              <li key={e.label}>• {e.label}</li>
            ))}
          </ul>
        </Card>
      </div>
      <FlowNav prevHref="/sell/routing" nextHref="/sell/handoff" />
    </PageShell>
  );
}
