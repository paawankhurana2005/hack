import Link from 'next/link';
import { mockOrders } from '@/lib/mocks/return-flow';
import { Eyebrow, GridBackdrop } from '@/components/ui/section';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPrice(cents: number) {
  return `₹${(cents / 100).toLocaleString('en-IN')}`;
}

export default function ReturnSelectorPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 pb-16 pt-12">
      <div className="relative">
        <GridBackdrop />
        <div className="relative">
          <Eyebrow className="mb-3">Return / Select order</Eyebrow>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Return an item
          </h1>
          <p className="mt-3 text-muted-foreground">Select the order you'd like to return.</p>
        </div>
      </div>

      <div className="mt-10 space-y-4">
        {mockOrders.map((order) => (
          <Link
            key={order.orderId}
            href={`/return/${order.orderId}`}
            className="group block rounded-2xl bg-card p-5 ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-brand/10 hover:ring-brand/40"
          >
            <div className="flex items-start gap-4">
              <div className="grid size-14 flex-shrink-0 place-items-center rounded-xl bg-brand/15 text-lg font-semibold text-brand">
                {order.productName[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{order.productName}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Order #{order.orderId}
                </p>
                <p className="text-sm text-muted-foreground">Ordered {formatDate(order.orderDate)}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="font-semibold tabular-nums text-brand">{formatPrice(order.priceCents)}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {order.category}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
