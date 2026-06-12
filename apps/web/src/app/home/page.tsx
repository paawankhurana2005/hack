import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageShell } from '@/components/layout/page-shell';

const choices = [
  {
    href: '/sell',
    title: 'Sell an item',
    blurb:
      'You have something with life left in it. We grade it, price it fairly, build a trust card, and match it to a nearby buyer.',
    tag: 'User-initiated',
  },
  {
    href: '/return',
    title: 'Return an item',
    blurb:
      'Returning a purchase? We grade it at your doorstep — before it moves — and the Intelligent Bridge picks the best next path.',
    tag: 'Amazon-decided',
  },
];

export default function HomePage() {
  return (
    <PageShell
      title="What would you like to do?"
      description="Two ways ReLoop keeps products in use."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {choices.map((c) => (
          <Link key={c.href} href={c.href} className="group">
            <Card className="h-full transition-colors group-hover:border-orange-500">
              <span className="text-xs font-semibold uppercase tracking-wide text-orange-500">
                {c.tag}
              </span>
              <h2 className="mt-3 text-xl font-bold text-white">{c.title}</h2>
              <p className="mt-2 text-sm text-muted">{c.blurb}</p>
              <span className="mt-6 inline-block text-sm font-semibold text-orange-500">
                Continue →
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
