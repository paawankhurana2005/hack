import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';

export default function ReturnHandoffPage() {
  return (
    <PageShell
      title="Handoff"
      description="Amazon arranges the handoff that matches the Bridge's chosen path."
    >
      <Placeholder
        spec="006"
        willDo="Arrange the handoff for the chosen path — local buyer, refurbisher, donation partner, recycler, or warehouse."
      />
      <FlowNav prevHref="/return/bridge" nextHref="/return/done" nextLabel="Confirm" />
    </PageShell>
  );
}
