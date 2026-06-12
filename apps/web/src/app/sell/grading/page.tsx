import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockGrading } from '@/mock/fixtures';

export default function SellGradingPage() {
  return (
    <PageShell
      title="AI grading"
      description="The eyes — a multimodal read of your item's condition from photos."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Placeholder
          spec="003"
          willDo="Run multimodal grading on uploaded photos and produce a ConditionGrade with confidence and detected issues."
        />
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Mock result</span>
            <Badge tone="accent">{mockGrading.grade}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">
            Confidence {(mockGrading.confidence * 100).toFixed(0)}%
          </p>
          <ul className="mt-3 list-inside list-disc text-sm text-muted">
            {mockGrading.detectedIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Card>
      </div>
      <FlowNav prevHref="/sell" nextHref="/sell/routing" />
    </PageShell>
  );
}
