import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start px-6 py-24">
      <span className="rounded-sm bg-orange-500/15 px-3 py-1 text-xs font-semibold text-orange-500">
        Amazon-native · Second life for products
      </span>
      <h1 className="mt-6 max-w-3xl text-5xl font-bold leading-tight tracking-tight text-white">
        Give returned and unused products a{' '}
        <span className="text-orange-500">second life</span>.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        ReLoop grades an item at the source, decides the best next path before it
        moves, and hands it to its next owner — no warehouse round-trip.
      </p>
      <div className="mt-10">
        <Button href="/home" variant="primary">
          Get started
        </Button>
      </div>
    </section>
  );
}
