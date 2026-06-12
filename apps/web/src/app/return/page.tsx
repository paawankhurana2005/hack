import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';

export default function ReturnReasonPage() {
  return (
    <PageShell
      title="Why are you returning this?"
      description="A quick reason helps us grade accurately and route to the best next path."
    >
      <Placeholder
        spec="002+"
        willDo="Capture the return reason and order/item context to seed doorstep grading."
      />
      <FlowNav nextHref="/return/grading" nextLabel="Continue to grading" />
    </PageShell>
  );
}
