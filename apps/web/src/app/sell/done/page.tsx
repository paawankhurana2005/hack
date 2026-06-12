import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SellDonePage() {
  return (
    <PageShell
      title="You're all set"
      description="Your item is on its way to a second life."
    >
      <Card>
        <p className="text-sm text-muted">
          This is a placeholder confirmation. Once the flow is live, you'll see the
          buyer match, handoff details, and your impact (value recovered + carbon
          saved) here.
        </p>
        <div className="mt-6 flex gap-3">
          <Button href="/home" variant="primary">
            Back to home
          </Button>
          <Button href="/sell" variant="secondary">
            Sell another item
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
