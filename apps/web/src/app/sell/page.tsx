import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';

export default function SellIntentPage() {
  return (
    <PageShell
      title="What are you selling?"
      description="Tell us about your item so we can grade it and find it a new home."
    >
      <Placeholder
        spec="002+"
        willDo="Capture item details and intent — product type, category, and a few photos to kick off AI grading."
      />
      <FlowNav nextHref="/sell/grading" nextLabel="Start grading" />
    </PageShell>
  );
}
