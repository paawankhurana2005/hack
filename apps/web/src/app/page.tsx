import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Hero />
      <Flows />
      <Dashboard />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-12 pt-20">
      <div className="max-w-3xl">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-foreground/60">
          <span className="size-1.5 animate-pulse rounded-full bg-orange" />
          Amazon-native · Operational
        </span>
        <h1 className="text-6xl font-bold leading-[0.9] tracking-tighter sm:text-7xl">
          Grade at the source. <br />
          <span className="text-orange">Decide before it moves.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-foreground/70">
          ReLoop intercepts returns and unused inventory at the doorstep. Our AI evaluates
          condition instantly to determine the most profitable — and most sustainable — next step.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/sell"
            className="rounded-full bg-navy px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Try the consumer flow
          </Link>
          <Link
            href="/seller"
            className="rounded-full border border-hairline bg-white px-6 py-3 text-sm font-semibold transition-colors hover:bg-surface"
          >
            See seller dashboard →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Flows() {
  return (
    <section id="flows" className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 md:grid-cols-2">
      {/* Sell flow */}
      <Link
        href="/sell"
        className="group relative overflow-hidden rounded-3xl bg-surface p-8 transition-all hover:bg-stone-100"
      >
        <div className="mb-12">
          <span className="inline-block rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
            Consumer App
          </span>
          <h3 className="mt-4 text-3xl font-bold">Sell &amp; Scale</h3>
          <p className="mt-2 text-foreground/60">AI-powered grading for unboxed items.</p>
        </div>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white shadow-xl shadow-black/5">
          <div className="absolute inset-0 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase text-foreground/40">
                Camera Viewport · 88.2% Active
              </div>
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange" />
            </div>
            <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/coffee-machine.jpg"
                alt="Espresso machine being graded"
                width={800}
                height={600}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px bg-orange/70 shadow-[0_0_12px_2px] shadow-orange/50" />
              <div className="absolute left-3 top-3 rounded border border-orange/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-orange backdrop-blur-sm">
                Scanning
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-surface pb-2">
                <span className="text-xs font-medium">Detected Item</span>
                <span className="font-mono text-xs">Breville Precision Brewer</span>
              </div>
              <div className="flex items-center justify-between border-b border-surface pb-2">
                <span className="text-xs font-medium">AI Condition Grade</span>
                <span className="font-mono text-xs font-bold italic text-success">A — EXCELLENT</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Estimated Payout</span>
                <span className="font-mono text-xs font-bold">$482.00</span>
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* Return flow */}
      <Link href="/seller" className="group relative overflow-hidden rounded-3xl bg-navy p-8 text-white transition-all">
        <div className="mb-12">
          <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
            Seller Hub
          </span>
          <h3 className="mt-4 text-3xl font-bold">Doorstep Routing</h3>
          <p className="mt-2 text-white/60">Intelligent logic for high-volume returns.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-8 flex h-8 w-8 items-center justify-center rounded-lg bg-orange">
              <div className="size-4 border-2 border-white" />
            </div>
            <div className="text-xs font-bold uppercase tracking-tight">Route: Resale</div>
            <div className="mt-1 text-[10px] text-white/40">Grade: A+ · High Local Demand</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 opacity-60">
            <div className="mb-8 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <div className="size-4 border-2 border-white/60" />
            </div>
            <div className="text-xs font-bold uppercase tracking-tight">Route: Refurb</div>
            <div className="mt-1 text-[10px] text-white/40">Grade: B− · Repairable Scuff</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 opacity-60">
            <div className="mb-8 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <div className="size-4 rounded-full border-2 border-white/60" />
            </div>
            <div className="text-xs font-bold uppercase tracking-tight">Route: Donate</div>
            <div className="mt-1 text-[10px] text-white/40">Grade: C · Local Partner</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 opacity-60">
            <div className="mb-8 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <div className="size-4 rotate-45 border-2 border-white/60" />
            </div>
            <div className="text-xs font-bold uppercase tracking-tight">Route: Recycle</div>
            <div className="mt-1 text-[10px] text-white/40">Grade: D · Materials Recovery</div>
          </div>
          <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-mono text-2xl font-bold">$14.2k</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-orange">
                  Saved Logistical Loss · last 24h
                </div>
              </div>
              <div className="flex h-12 w-28 items-end gap-1">
                <div className="h-4 w-full bg-white/20" />
                <div className="h-8 w-full bg-white/20" />
                <div className="h-6 w-full bg-white/20" />
                <div className="h-10 w-full bg-white/20" />
                <div className="h-12 w-full bg-orange" />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

type Row = {
  id: string;
  item: string;
  grade: 'A' | 'B+' | 'B' | 'C';
  source: string;
  route: string;
  routeTone: 'orange' | 'navy' | 'muted';
  recovery: string;
};

const ROWS: Row[] = [
  { id: 'AMZ-9021-KLX', item: 'Kindle Paperwhite', grade: 'A', source: 'Doorstep Return', route: 'Direct Resale', routeTone: 'orange', recovery: '$124.50' },
  { id: 'AMZ-8842-TRV', item: 'Anker PowerCore', grade: 'B+', source: 'Marketplace · Sell', route: 'Buyer Matched · 9.2km', routeTone: 'orange', recovery: '$48.20' },
  { id: 'AMZ-7712-QPC', item: 'Bose QC45 Headphones', grade: 'B', source: 'Doorstep Return', route: 'Refurbish Hub · SEA-4', routeTone: 'navy', recovery: '$189.00' },
  { id: 'AMZ-6610-DKR', item: 'Levoit Air Purifier', grade: 'C', source: 'Excess Inventory', route: 'Local Donation', routeTone: 'muted', recovery: '$0.00' },
];

function Dashboard() {
  return (
    <section id="dashboard" className="mx-auto mt-20 max-w-7xl px-6 pb-24">
      <div className="rounded-3xl border border-surface bg-white p-8 md:p-12">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-orange">
              Live · Seattle Cluster
            </span>
            <h2 className="mt-2 text-4xl font-bold tracking-tighter">Live Routing Engine</h2>
            <p className="mt-2 text-foreground/60">
              Current return operations across the Pacific Northwest logistics network.
            </p>
          </div>
          <div className="flex gap-6">
            <Stat label="Active Couriers" value="1,204" />
            <Stat label="Success Rate" value="99.8%" />
            <Stat label="Recovery 7d" value="$2.4M" accent />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-4">
            <Step n="01" title="Visual Grading" body="AI verifies authenticity and wear in 4.2s." />
            <Step n="02" title="Dynamic Pricing" body="Real-time matching with local secondary-market prices." />
            <Step n="03" title="Hyper-local Routing" body="Item moves directly to a new buyer or the nearest refurb hub." accent />
          </div>
          <div className="lg:col-span-2">
            <div className="relative aspect-[16/7] w-full overflow-hidden rounded-2xl bg-surface outline outline-1 -outline-offset-1 outline-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/network-topology.jpg"
                alt="Network topology view"
                width={1280}
                height={560}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <div className="absolute left-4 top-4 rounded border border-hairline bg-white/90 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-foreground/60 backdrop-blur-sm">
                Network Topology · PNW
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline table */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-surface text-[10px] font-bold uppercase tracking-widest text-foreground/50">
                  <th className="px-6 py-3 font-bold">Item</th>
                  <th className="px-6 py-3 font-bold">Grade</th>
                  <th className="px-6 py-3 font-bold">Source</th>
                  <th className="px-6 py-3 font-bold">Routing Outcome</th>
                  <th className="px-6 py-3 text-right font-bold">Recovery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface">
                {ROWS.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface/40">
                    <td className="px-6 py-4">
                      <div className="font-medium">{r.item}</div>
                      <div className="font-mono text-[11px] text-foreground/40">{r.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <GradeBadge grade={r.grade} />
                    </td>
                    <td className="px-6 py-4 text-foreground/60">{r.source}</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-full ${
                            r.routeTone === 'orange'
                              ? 'bg-orange'
                              : r.routeTone === 'navy'
                                ? 'bg-navy'
                                : 'bg-stone-300'
                          }`}
                        />
                        {r.route}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-semibold">{r.recovery}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">{label}</div>
      <div className={`font-mono text-lg font-bold ${accent ? 'text-orange' : ''}`}>{value}</div>
    </div>
  );
}

function Step({ n, title, body, accent }: { n: string; title: string; body: string; accent?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={`grid size-12 shrink-0 place-items-center rounded-xl bg-surface font-mono text-sm font-bold ${
          accent ? 'text-orange' : ''
        }`}
      >
        {n}
      </div>
      <div className="pt-1">
        <div className="text-sm font-bold">{title}</div>
        <div className="text-xs leading-relaxed text-foreground/50">{body}</div>
      </div>
    </div>
  );
}

function GradeBadge({ grade }: { grade: Row['grade'] }) {
  const styles: Record<Row['grade'], string> = {
    A: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    'B+': 'bg-amber-50 text-amber-700 ring-amber-200',
    B: 'bg-amber-50 text-amber-700 ring-amber-200',
    C: 'bg-stone-100 text-stone-600 ring-stone-200',
  };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 font-mono text-[11px] font-bold ring-1 ${styles[grade]}`}>
      {grade}
    </span>
  );
}

function Footer() {
  return (
    <footer className="border-t border-surface bg-surface/50">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center">
        <div className="text-sm">
          <span className="font-bold tracking-tight">
            RE<span className="text-orange">LOOP</span>
          </span>
          <span className="ml-3 text-foreground/50">
            Second life for Amazon returns and excess inventory.
          </span>
        </div>
        <div className="flex gap-6 font-mono text-[10px] font-bold uppercase tracking-widest text-foreground/50">
          <a href="#" className="hover:text-orange">System Status</a>
          <a href="#" className="hover:text-orange">API Docs</a>
          <a href="#" className="hover:text-orange">Governance</a>
        </div>
      </div>
    </footer>
  );
}
