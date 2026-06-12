import { PageShell } from '@/components/layout/page-shell';
import { Placeholder } from '@/components/placeholder';
import { FlowNav } from '@/components/layout/flow-nav';
import { Card } from '@/components/ui/card';
import { mockRouting } from '@/mock/fixtures';

export default function SellRoutingPage() {
  const price = `$${(mockRouting.estimatedValue.amountCents / 100).toFixed(2)}`;
  return (
    <PageShell
      title="Pricing & match prep"
      description="A fair suggested price and the prep to match your item to a nearby buyer."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Placeholder
          spec="004"
          willDo="Suggest a fair price and prepare a local match using value, demand, and handling-cost signals."
        />
        <Card>
          <p className="text-sm text-muted">Suggested price</p>
          <p className="mt-1 text-3xl font-bold text-white">{price}</p>
          <ul className="mt-4 space-y-1 text-sm text-muted">
            {mockRouting.factors.map((f) => (
              <li key={f.label} className="flex justify-between">
                <span>{f.label}</span>
                <span className="text-white">{f.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <FlowNav prevHref="/sell/grading" nextHref="/sell/health-card" />
    </PageShell>
  );
}
