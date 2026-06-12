import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';

export default function SellHandoffPage() {
  return (
    <PageShell
      title="Local match & handoff"
      description="We've found a nearby buyer — Amazon arranges the handoff. The item never touches a warehouse."
    >
      <Placeholder
        spec="006"
        willDo="Surface the matched local buyer and arrange the Amazon-handled handoff (pickup/drop-off and timing)."
      />
      <FlowNav prevHref="/sell/health-card" nextHref="/sell/done" nextLabel="Confirm handoff" />
    </PageShell>
  );
}
