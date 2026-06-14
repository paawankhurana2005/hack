import Link from 'next/link';
import { mockOrders } from '@/lib/mocks/return-flow';
import { Eyebrow, GridBackdrop } from '@/components/ui/section';
import { ProductThumb } from '@/components/return/ProductThumb';
import { ChevronRightIcon } from '@/components/return/icons';

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
          <Eyebrow className="mb-3">Return · Select order</Eyebrow>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Return an item
          </h1>
          <p className="mt-3 text-muted-foreground">
            Choose the order you'd like to return. We'll grade it at your doorstep and find it the
            best next home.
          </p>
        </div>
      </div>

      <div className="mt-10 space-y-3">
        {mockOrders.map((order) => (
          <Link
            key={order.orderId}
            href={`/return/${order.orderId}`}
            className="group flex items-center gap-4 rounded-2xl bg-card p-4 ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-brand/10 hover:ring-brand/40"
          >
            <ProductThumb name={order.productName} imageUrl={order.imageUrl} />

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{order.productName}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Order #{order.orderId}
              </p>
              <p className="text-sm text-muted-foreground">Ordered {formatDate(order.orderDate)}</p>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2 text-right">
              <div>
                <p className="font-semibold tabular-nums text-foreground">
                  {formatPrice(order.priceCents)}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {order.category}
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
