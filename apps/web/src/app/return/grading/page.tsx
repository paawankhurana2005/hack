import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockGrading } from '@/mock/fixtures';

export default function ReturnGradingPage() {
  return (
    <PageShell
      title="Doorstep grading"
      description="The core move — we grade the item at the source, before it moves."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Placeholder
          spec="003"
          willDo="Grade the returned item at the doorstep from photos, producing a condition read the Bridge can act on."
        />
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Mock grade</span>
            <Badge tone="accent">{mockGrading.grade}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">
            Confidence {(mockGrading.confidence * 100).toFixed(0)}%
          </p>
        </Card>
      </div>
      <FlowNav prevHref="/return" nextHref="/return/bridge" nextLabel="See decision" />
    </PageShell>
  );
}
