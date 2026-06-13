'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-surface text-foreground selection:bg-brand selection:text-brand-foreground">
      <Hero />
      <PillarEyes />
      <PillarBrain />
      <PillarTrust />
      <Impact />
      <CTA />
    </div>
  );
}

function useCountUp(target: number, duration = 1800, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && setSeen(true), {
      threshold: 0.3,
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

function Stat({
  value,
  suffix = '',
  prefix = '',
  label,
  fixed = 0,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  fixed?: number;
}) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const v = useCountUp(value, 1800, seen);
  return (
    <div ref={ref}>
      <div className="mb-2 text-4xl font-semibold tracking-tight tabular-nums text-foreground md:text-5xl">
        {prefix}
        {v.toLocaleString('en-US', { minimumFractionDigits: fixed, maximumFractionDigits: fixed })}
        {suffix}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Hero() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  return (
    <section
      ref={heroRef}
      onMouseMove={(e) => {
        const r = heroRef.current?.getBoundingClientRect();
        if (!r) return;
        setMouse({
          x: ((e.clientX - r.left) / r.width) * 100,
          y: ((e.clientY - r.top) / r.height) * 100,
        });
      }}
      className="relative overflow-hidden pb-24 pt-24"
    >
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-300"
        style={{
          background: `radial-gradient(600px circle at ${mouse.x}% ${mouse.y}%, color-mix(in oklab, oklch(var(--brand)) 12%, transparent), transparent 60%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in oklab, oklch(var(--foreground)) 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, oklch(var(--foreground)) 8%, transparent) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 75%)',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6">
        <div className="text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-brand">
              Live · Amazon Hackathon Build
            </span>
          </div>

          <h1 className="mb-8 text-balance text-5xl font-semibold leading-[0.95] tracking-tighter text-foreground md:text-7xl lg:text-[5.5rem]">
            The landfill is a{' '}
            <span className="relative inline-block">
              <span className="italic text-muted-foreground">design flaw</span>
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 8" preserveAspectRatio="none">
                <path
                  d="M2 5 Q 50 1, 100 4 T 198 3"
                  stroke="oklch(var(--brand))"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            .
          </h1>

          <p className="mx-auto mb-10 max-w-[52ch] text-pretty text-base text-muted-foreground md:text-lg">
            AI-driven grading, smart redistribution, and instant trust for every Amazon return. Built
            on NVIDIA NIM.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="group flex items-center gap-2 rounded-lg bg-brand py-2 pl-2 pr-4 font-medium text-brand-foreground ring-1 ring-brand/50 transition hover:shadow-[0_0_40px_rgba(234,179,8,0.35)] active:scale-95"
            >
              <span className="grid size-6 place-items-center rounded bg-brand-foreground/10 text-sm">
                →
              </span>
              Try the demo
            </Link>
            <Link
              href="/sell"
              className="px-6 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sell an item →
            </Link>
          </div>
        </div>

        {/* Kinetic centerpiece */}
        <div className="relative mt-20 flex justify-center">
          <div className="absolute inset-0 animate-glow rounded-full bg-brand/10 blur-[140px]" />
          <div className="relative size-72 md:size-96">
            <div className="absolute inset-0 rounded-full border border-border" />
            <div
              className="absolute inset-4 animate-spin-slow rounded-full border border-border/70"
              style={{ borderStyle: 'dashed' }}
            />
            <div className="absolute inset-12 animate-spin-reverse rounded-full border border-border/40" />

            {[0, 90, 180, 270].map((deg, i) => (
              <div
                key={deg}
                className="absolute left-1/2 top-1/2 -ml-1 -mt-1 size-2"
                style={{ transform: `rotate(${deg}deg) translateX(11rem)` }}
              >
                <div
                  className={`size-2 rounded-full ${
                    i === 1 ? 'bg-brand shadow-[0_0_12px_oklch(var(--brand))]' : 'bg-muted-foreground/50'
                  }`}
                />
              </div>
            ))}

            <div className="absolute inset-0 grid place-items-center">
              <div className="relative size-36 animate-float overflow-hidden rounded-3xl bg-card ring-1 ring-border md:size-44">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/hero-item.jpg"
                  alt="Returned product entering the loop"
                  className="h-full w-full object-cover"
                  width={512}
                  height={512}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-card/95 to-transparent p-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-brand">
                    Input_Item · scanning
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* status strip */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>NVIDIA NIM · Online</span>
          <span className="text-border">/</span>
          <span>Llama-3.2-90B-Vision</span>
          <span className="text-border">/</span>
          <span>Llama-3.3-70B-Instruct</span>
          <span className="text-border">/</span>
          <span className="text-brand">All systems green</span>
        </div>
      </div>
    </section>
  );
}

function PillarEyes() {
  return (
    <section id="eyes" className="relative border-t border-border/50 py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <span className="mb-4 block font-mono text-xs uppercase tracking-widest text-brand">
            Pillar 01 / Perception
          </span>
          <h2 className="mb-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl">
            See value where others see waste.
          </h2>
          <p className="mb-8 max-w-[48ch] text-pretty text-muted-foreground">
            A vision-language model inspects every return in real time — condition, authenticity, and
            serial numbers in under a second.
          </p>
          <div className="space-y-3">
            {[
              ['A1', 'STRUCTURAL_INTEGRITY', 'PASS'],
              ['A2', 'SERIAL_OCR', '8392-XX-A7'],
              ['A3', 'ACCESSORIES_DETECTED', '3 of 3'],
            ].map(([id, k, v]) => (
              <div
                key={id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card/40 p-3 backdrop-blur"
              >
                <div className="grid size-8 place-items-center rounded bg-brand/15 font-mono text-[10px] text-brand">
                  {id}
                </div>
                <div className="flex-1 font-mono text-xs text-muted-foreground">{k}</div>
                <div className="font-mono text-xs text-brand">{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="relative rounded-3xl bg-card p-3 shadow-2xl shadow-black/40 ring-1 ring-border">
            <div className="flex items-center justify-between px-3 py-1.5">
              <div className="flex gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                <span className="size-2 rounded-full bg-brand/80" />
              </div>
              <div className="font-mono text-[10px] tracking-wider text-muted-foreground">
                grade.live ⌁ session_082
              </div>
              <div className="font-mono text-[10px] text-brand">REC ●</div>
            </div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/grading-scan.jpg"
                alt="AI grading scan"
                loading="lazy"
                width={1280}
                height={800}
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-[18%] top-[18%] h-28 w-28 border-l-2 border-t-2 border-brand/80" />
                <div className="absolute right-[18%] top-[18%] h-28 w-28 border-r-2 border-t-2 border-brand/80" />
                <div className="absolute bottom-[18%] left-[18%] h-28 w-28 border-b-2 border-l-2 border-brand/80" />
                <div className="absolute bottom-[18%] right-[18%] h-28 w-28 border-b-2 border-r-2 border-brand/80" />
                <div className="absolute inset-x-0 top-0 h-[2px] animate-scan bg-brand shadow-[0_0_24px_oklch(var(--brand))]" />
                <div className="absolute right-3 top-3 rounded border border-brand/30 bg-background/70 px-2 py-1 font-mono text-[10px] text-brand backdrop-blur">
                  1280×800 · 24fps
                </div>
              </div>
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl border border-border bg-background/80 p-3 backdrop-blur">
                <div className="flex items-center gap-4">
                  <div className="font-mono text-[10px] text-muted-foreground">DETECTION 99.8%</div>
                  <div className="font-mono text-[10px] text-brand">CLASS · GRADE_A_CERTIFIED</div>
                </div>
                <div className="hidden font-mono text-[10px] text-muted-foreground sm:block">
                  latency 412ms
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PillarBrain() {
  const routes = [
    { tag: '01', title: 'Resell', body: 'Instant pricing + Warehouse Deals listing.', meta: 'Est. Recovery', value: '84%', featured: false },
    { tag: '02', title: 'Refurbish', body: 'Repairable flaws → regional centers.', meta: 'Path Logic', value: '≤ B+ grade', featured: true },
    { tag: '03', title: 'Redistribute', body: 'Surplus rerouted to low-stock nodes.', meta: 'LCA Saved', value: '4.2 kg CO₂', featured: false },
    { tag: '04', title: 'Donate', body: 'Auto-matched with verified non-profits.', meta: 'Tax Credit', value: '$40 avg', featured: false },
  ];
  return (
    <section id="brain" className="relative border-t border-border/50 bg-card/20 py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 grid items-end gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span className="mb-4 block font-mono text-xs uppercase tracking-widest text-brand">
              Pillar 02 / Intelligence
            </span>
            <h2 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl">
              Smart routing. Maximum recovery. Zero guesswork.
            </h2>
          </div>
          <div className="lg:col-span-5 lg:text-right">
            <p className="font-mono text-sm text-muted-foreground">
              <span className="text-brand">{'>'}</span> LLM explains. Rules decide.
              <br />
              <span className="text-brand">{'>'}</span> Every decision is auditable.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {routes.map((r) => (
            <div
              key={r.tag}
              className={`group relative rounded-2xl bg-card p-6 ring-1 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand/10 ${
                r.featured ? 'bg-gradient-to-b from-brand/10 to-card ring-brand/40' : 'ring-border'
              }`}
            >
              <div className="mb-6 flex items-center justify-between">
                <div
                  className={`grid size-10 place-items-center rounded-lg font-mono text-sm ${
                    r.featured ? 'bg-brand text-brand-foreground' : 'bg-muted text-brand'
                  }`}
                >
                  {r.tag}
                </div>
                {r.featured && (
                  <span className="rounded-full border border-brand/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand">
                    Recommended
                  </span>
                )}
              </div>
              <h3 className="mb-2 text-xl font-semibold text-foreground">{r.title}</h3>
              <p className="mb-6 min-h-[64px] text-pretty text-sm text-muted-foreground">{r.body}</p>
              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {r.meta}
                </span>
                <span className="font-mono text-xs text-foreground">{r.value}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
            <div className="mb-6 font-mono text-[10px] uppercase tracking-widest text-brand">
              /api/sell/price · live trace
            </div>
            <div className="space-y-3">
              {[
                ['Retail estimate', '$189.00', 'llama-3.3-70b'],
                ['Market demand', 'HIGH', '0.91'],
                ['Condition penalty', '× 0.85', 'grade A'],
                ['Recency bonus', '× 1.04', '11 mo'],
              ].map(([label, value, meta]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-border/40 py-2"
                >
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-foreground">{value}</span>
                    <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {meta}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3">
                <span className="text-xs font-medium text-foreground">Final listing</span>
                <span className="text-lg font-semibold text-brand">$167.32</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-2xl bg-card p-6 ring-1 ring-border">
            <div>
              <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-brand">
                routing_decision
              </div>
              <div className="mb-2 text-3xl font-semibold tracking-tight text-foreground">
                Refurbish → Resell
              </div>
              <p className="text-sm text-muted-foreground">
                Buff + recert lifts grade A → A+, unlocking $24 in incremental recovery.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" />
              Confirmed · 0.41s
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PillarTrust() {
  return (
    <section id="trust" className="overflow-hidden border-t border-border/50 py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-20 px-6 lg:grid-cols-2">
        <div className="relative order-2 lg:order-1">
          <div className="absolute -inset-12 rounded-full bg-brand/10 blur-3xl" />
          <div className="relative rotate-[-1.5deg] rounded-[32px] bg-background p-1 shadow-2xl shadow-black/50 ring-1 ring-border transition-transform duration-500 hover:rotate-0">
            <div className="rounded-[28px] bg-card p-8">
              <div className="mb-10 flex items-start justify-between">
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
                    Health Card · ID
                  </div>
                  <div className="font-mono text-sm tracking-tight text-foreground">RLP-7729-XM4</div>
                </div>
                <div className="grid size-12 animate-glow place-items-center rounded-full border-2 border-brand font-mono text-[10px] font-semibold text-brand">
                  VFD
                </div>
              </div>

              <div className="mb-8 space-y-4">
                {[
                  ['Condition', 'Pristine (A+)'],
                  ['Battery Health', '98% nominal'],
                  ['Previous Loops', '01 · original owner'],
                  ['Serial Verified', '✓ 6 of 6 digits'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-end justify-between border-b border-border/50 pb-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
                    <span className="text-sm font-medium text-foreground">{v}</span>
                  </div>
                ))}
              </div>

              <div className="mb-4 rounded-xl bg-background/60 p-4">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-brand">
                  Timeline
                </div>
                <div className="relative space-y-2.5 pl-4">
                  <div className="absolute bottom-1 left-[5px] top-1 w-px bg-border" />
                  {[
                    ['14:00', 'Item dropped at Hub-4'],
                    ['14:01', 'VLM grading complete'],
                    ['14:02', 'Routed → resell'],
                  ].map(([t, m]) => (
                    <div key={t} className="relative flex gap-3 font-mono text-[11px] text-muted-foreground">
                      <span className="absolute -left-4 top-1.5 size-2 rounded-full bg-brand ring-2 ring-card" />
                      <span className="text-brand">{t}</span>
                      <span>{m}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-background/60 p-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
                STAMPED · 14:02 UTC / SEATTLE-HUB-4
                <br />
                VALIDATED · LLAMA-3.2-VISION-B90
                <br />
                STATUS · <span className="text-brand">SECOND_LIFE_READY</span>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <span className="mb-4 block font-mono text-xs uppercase tracking-widest text-brand">
            Pillar 03 / Trust
          </span>
          <h2 className="mb-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl">
            The Product Health Card.
          </h2>
          <p className="mb-8 max-w-[44ch] text-pretty text-muted-foreground">
            Every item gets a digital twin — condition, history, and authenticity proof — making
            resale as trusted as buying new.
          </p>
          <ul className="mb-8 space-y-3">
            {[
              'Transparent provenance',
              'Instant model + serial verification',
              'Residual-value prediction',
              'Shareable & scannable',
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm text-foreground">
                <span className="size-1.5 rounded-full bg-brand" />
                {t}
              </li>
            ))}
          </ul>
          <Link
            href="/sell"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand transition-all hover:gap-3"
          >
            Create a Health Card
            <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Impact() {
  return (
    <section id="impact" className="border-y border-border/60 bg-card/10 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-brand">
            Impact / since v0.1
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            updated · live
          </span>
        </div>
        <div className="grid grid-cols-2 gap-12 lg:grid-cols-4">
          <Stat value={1.2} fixed={1} suffix="M+" label="Items rescued" />
          <Stat value={420} suffix="k T" label="Landfill diverted" />
          <Stat value={84} prefix="$" suffix="M" label="Value recovered" />
          <Stat value={14.2} fixed={1} suffix="%" label="Return efficiency lift" />
        </div>

        <div className="relative mt-20 overflow-hidden border-y border-border/60 py-6">
          <div className="flex animate-marquee gap-12 whitespace-nowrap">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex shrink-0 gap-12">
                {[
                  'Returns rerouted',
                  'Items refurbished',
                  'Donations matched',
                  'Sellers listed',
                  'Carbon avoided',
                  'Trust cards minted',
                ].map((t, i) => (
                  <div key={`${k}-${i}`} className="flex items-center gap-4">
                    <span className="size-1.5 rounded-full bg-brand" />
                    <span className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                      {t}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <footer id="cta" className="py-32">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="mb-10 text-balance text-5xl font-semibold tracking-tighter text-foreground md:text-6xl">
          Ready to close <span className="italic text-brand">the loop</span>?
        </h2>
        <div className="mb-16 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/return"
            className="group flex items-center gap-2 rounded-lg bg-foreground py-2 pl-2 pr-4 font-medium text-background transition hover:opacity-90 active:scale-95"
          >
            <span className="grid size-6 place-items-center rounded bg-background/10 text-sm">→</span>
            Start a Return
          </Link>
          <Link
            href="/sell"
            className="flex items-center gap-2 rounded-lg bg-card py-2 pl-2 pr-4 font-medium text-foreground ring-1 ring-border transition hover:bg-muted active:scale-95"
          >
            <span className="grid size-6 place-items-center rounded bg-foreground/5 text-sm">$</span>
            Sell an item
          </Link>
        </div>
        <div className="flex flex-col items-center justify-between gap-6 border-t border-border/60 pt-12 md:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Built for the
            </span>
            <span className="text-xs font-medium tracking-tight text-foreground">
              Amazon NextGen Hackathon
            </span>
          </div>
          <div className="flex gap-6 text-xs text-muted-foreground">
            <span className="text-foreground/70">AI Grading</span>
            <span className="text-foreground/70">Smart Routing</span>
            <span className="text-foreground/70">Health Card</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
