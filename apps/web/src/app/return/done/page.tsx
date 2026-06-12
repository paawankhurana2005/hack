import { PageShell } from '@/components/layout/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ReturnDonePage() {
  return (
    <PageShell title="Return handled" description="Decided at the source — no warehouse detour.">
      <Card>
        <p className="text-sm text-muted">
          This is a placeholder confirmation. Once live, you'll see the chosen path,
          handoff details, and the impact (cost avoided + carbon saved) here.
        </p>
        <div className="mt-6">
          <Button href="/home" variant="primary">
            Back to home
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
