import Link from 'next/link';
import { mockOrders } from '@/lib/mocks/return-flow';

const CATEGORY_COLORS: Record<string, string> = {
  electronics: 'bg-blue-900 text-blue-300',
  apparel: 'bg-purple-900 text-purple-300',
  kitchenware: 'bg-amber-900 text-amber-300',
};

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
    <section className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-white">Return an item</h1>
      <p className="mt-2 text-muted">Select the order you'd like to return.</p>

      <div className="mt-8 space-y-4">
        {mockOrders.map((order) => (
          <Link
            key={order.orderId}
            href={`/return/${order.orderId}`}
            className="block rounded-lg border border-navy-600 bg-navy-800 p-5 shadow-sm transition-colors hover:border-orange-500 hover:bg-navy-700"
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md text-lg font-bold ${CATEGORY_COLORS[order.category] ?? 'bg-navy-700 text-white'}`}
              >
                {order.productName[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{order.productName}</p>
                <p className="mt-1 text-sm text-muted">Order #{order.orderId}</p>
                <p className="text-sm text-muted">Ordered {formatDate(order.orderDate)}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="font-semibold text-orange-500">{formatPrice(order.priceCents)}</p>
                <p className="mt-1 text-xs text-muted capitalize">{order.category}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
