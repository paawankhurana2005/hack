'use client';

import React, { useEffect, useRef, useState } from 'react';

// ─── Demo data ────────────────────────────────────────────────────────────────
const DATA = {
  total: 47,
  rescued: 28,
  refurbished: 9,
  donated: 6,
  discarded: 4,
  weightKg: 1.2,
  co2PerUnit: 2.8,
};

const secondLife = DATA.rescued + DATA.refurbished + DATA.donated;
const co2Saved   = secondLife * DATA.co2PerUnit;
const landfill   = secondLife * DATA.weightKg;
const score      = Math.round((secondLife / DATA.total) * 1000) / 10;
const CIRC       = 2 * Math.PI * 54;

const JOURNEY_STEPS = [
  { label: 'Return\nInitiated', date: 'Jun 3' },
  { label: 'AI Graded',        date: 'Jun 3', badge: 'Grade B' },
  { label: 'Listed\nLocally',  date: 'Jun 4' },
  { label: 'Buyer\nFound',     date: 'Jun 5' },
  { label: 'Delivered',        date: 'Jun 6' },
];

const TIERS = [
  { name: 'Bronze',   range: '0 – 40',   min: 0,  color: '#A07040' },
  { name: 'Silver',   range: '41 – 65',  min: 41, color: '#9CA3AF' },
  { name: 'Gold',     range: '66 – 85',  min: 66, color: '#D4A843' },
  { name: 'Platinum', range: '86 – 100', min: 86, color: '#94A3B8' },
];

const ACHIEVEMENTS = [
  { name: 'First Local Rescue',  desc: 'Rerouted first return to a verified local buyer' },
  { name: '10 Products Saved',   desc: 'Rescued 10+ products from landfill or warehouse disposal' },
  { name: 'Zero Discard Week',   desc: 'Completed a full 7-day window with zero products discarded' },
];

const FATE_ROWS = [
  { color: '#FF9900', name: 'Rescued locally', n: 28, pct: '59.6%' },
  { color: '#2DD4BF', name: 'Refurbished',      n: 9,  pct: '19.1%' },
  { color: '#60A5FA', name: 'Donated',          n: 6,  pct: '12.8%' },
  { color: '#3D4B61', name: 'Discarded',        n: 4,  pct: '8.5%'  },
];

// ─── SVG Icons ────────────────────────────────────────────────────────────────
function IconLoop({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function IconLeaf({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function IconShield({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconCheck({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconBarChart({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconAward({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function useCounter(target: number, decimals = 0, duration = 1500, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        setVal(ease * target);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [target, duration, delay]);
  return decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString();
}

// ─── Donut chart ──────────────────────────────────────────────────────────────
function DonutChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const CARD_BG = 'oklch(0.21 0.006 285)';
    async function init() {
      const { Chart, ArcElement, DoughnutController, Tooltip } = await import('chart.js');
      Chart.register(ArcElement, DoughnutController, Tooltip);
      if (!canvasRef.current) return;
      const chart = new Chart(canvasRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Rescued locally', 'Refurbished', 'Donated', 'Discarded'],
          datasets: [{
            data: [DATA.rescued, DATA.refurbished, DATA.donated, DATA.discarded],
            backgroundColor: ['#FF9900', '#2DD4BF', '#60A5FA', '#3D4B61'],
            borderWidth: 3,
            borderColor: CARD_BG,
            hoverOffset: 8,
          }],
        },
        options: {
          cutout: '72%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'oklch(0.27 0.006 285)',
              titleColor: '#FF9900',
              bodyColor: 'oklch(0.985 0 0)',
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: (ctx) =>
                  ` ${ctx.label}: ${ctx.parsed as number} (${(((ctx.parsed as number) / DATA.total) * 100).toFixed(1)}%)`,
              },
            },
          },
          animation: { duration: 1200, easing: 'easeInOutQuart' },
          responsive: false,
        },
      });
      return chart;
    }
    let chartInstance: import('chart.js').Chart | undefined;
    void init().then((c) => { chartInstance = c; });
    return () => { chartInstance?.destroy(); };
  }, []);

  return <canvas ref={canvasRef} width={160} height={160} />;
}

// ─── Progress ring ────────────────────────────────────────────────────────────
function ProgressRing({ value }: { value: number }) {
  const ringRef = useRef<SVGCircleElement>(null);
  const displayed = useCounter(Math.round(value), 0, 2000, 400);

  useEffect(() => {
    const id = setTimeout(() => {
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = String(CIRC * (1 - value / 100));
      }
    }, 500);
    return () => clearTimeout(id);
  }, [value]);

  return (
    <div className="relative mx-auto w-52 h-52">
      <svg viewBox="0 0 120 120" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF9900" /><stop offset="100%" stopColor="#FFD060" />
          </linearGradient>
          <filter id="ringGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="60" cy="60" r="54" fill="none" stroke="oklch(0.27 0.006 285)" strokeWidth="10" />
        <circle
          ref={ringRef} cx="60" cy="60" r="54" fill="none"
          stroke="url(#ringGrad)" strokeWidth="10" strokeLinecap="round"
          filter="url(#ringGlow)"
          style={{ strokeDasharray: CIRC, strokeDashoffset: CIRC, transition: 'stroke-dashoffset 2s cubic-bezier(0.25,0.46,0.45,0.94)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black tracking-tighter text-foreground tabular-nums leading-none">{displayed}</span>
        <span className="text-sm font-medium text-muted-foreground mt-1">/100</span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Score</span>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  eyebrow,
  title,
  Icon,
}: {
  eyebrow: string;
  title: string;
  Icon: ({ className }: { className?: string }) => React.JSX.Element;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-3 w-[2px] rounded-full bg-brand" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-brand">{eyebrow}</span>
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary ring-1 ring-border">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export function SellerDashboard() {
  const cA = useCounter(secondLife, 0, 1500, 150);
  const cB = useCounter(co2Saved,   1, 1800, 280);
  const cC = useCounter(landfill,   1, 1800, 410);

  const currentTier = [...TIERS].reverse().find((t) => score >= t.min) ?? TIERS[0]!;
  const nextTier    = TIERS[TIERS.indexOf(currentTier) + 1];

  return (
    <div className="flex flex-col gap-8" style={{ animation: 'fade-up 0.4s ease both' }}>

      {/* Page header */}
      <div>
        <span className="font-mono text-xs uppercase tracking-widest text-brand">Seller / Overview</span>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">TechBazaar Pvt Ltd</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Return rescue performance and sustainability metrics at a glance.
        </p>
      </div>

      {/* ══════════ SECTION 1 — IMPACT DASHBOARD ══════════ */}
      <section
        className="rounded-2xl border border-border bg-card/40 p-6"
        style={{ animation: 'fade-up 0.45s ease 0.05s both' }}
      >
        <SectionHeader
          eyebrow="Impact Dashboard · June 2026"
          title="Product rescue overview"
          Icon={IconBarChart}
        />

        {/* Summary KPIs */}
        <div className="grid grid-cols-3 overflow-hidden rounded-xl bg-secondary ring-1 ring-border mb-5">
          {[
            { val: '47',    label: 'Total Returns',    accent: false },
            { val: '43',    label: 'Products Rescued', accent: false },
            { val: '91.5%', label: 'Recovery Rate',    accent: true  },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`py-5 text-center ${i > 0 ? 'border-l border-border' : ''}`}
            >
              <p className={`text-2xl font-bold tracking-tight tabular-nums ${s.accent ? 'text-brand' : 'text-foreground'}`}>
                {s.val}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Metric cards + Donut chart */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_auto] mb-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { Icon: IconLoop,   val: cA, unit: '',    label: 'Products got a second life',      delay: '0.05s' },
              { Icon: IconLeaf,   val: cB, unit: ' kg', label: 'CO₂ saved vs warehouse route',    delay: '0.1s'  },
              { Icon: IconShield, val: cC, unit: ' kg', label: 'Landfill waste prevented',        delay: '0.15s' },
            ].map((s) => (
              <div
                key={s.label}
                className="relative overflow-hidden rounded-2xl bg-secondary ring-1 ring-border p-4"
                style={{ animation: `fade-up 0.5s ease ${s.delay} both` }}
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-brand/30" />
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-brand/20">
                    <s.Icon className="w-3.5 h-3.5 text-brand" />
                  </div>
                </div>
                <p className="text-3xl font-bold tracking-tighter text-foreground tabular-nums leading-none">
                  {s.val}
                  <span className="text-base font-normal text-muted-foreground">{s.unit}</span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Donut chart */}
          <div className="rounded-2xl bg-secondary ring-1 ring-border p-4 flex flex-col justify-center min-w-[260px]">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
              Product fate breakdown
            </p>
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <DonutChart />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-foreground leading-none">43</span>
                  <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Rescued</span>
                </div>
              </div>
              <ul className="flex flex-col gap-2.5">
                {FATE_ROWS.map((row) => (
                  <li key={row.name} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: row.color }} />
                    <span className="text-xs text-foreground">{row.name}</span>
                    <span className="ml-auto pl-3 text-xs font-semibold text-foreground tabular-nums">{row.n}</span>
                    <span className="w-9 text-right text-[10px] text-muted-foreground tabular-nums">{row.pct}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Product journey */}
        <div className="rounded-2xl bg-secondary ring-1 ring-border p-5">
          <div className="flex items-center justify-between mb-7">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Product journey
            </p>
            <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
              Sample · SKU #B4821
            </span>
          </div>
          <div className="relative flex items-start">
            {/* Background track */}
            <div className="pointer-events-none absolute top-[15px] left-[10%] right-[10%] h-px bg-border" />
            {/* Filled progress */}
            <div className="pointer-events-none absolute top-[15px] left-[10%] right-[10%] h-px bg-brand/40" />
            {JOURNEY_STEPS.map((step, i) => (
              <div key={step.label} className="relative z-10 flex flex-1 flex-col items-center">
                <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-card ring-1 ring-brand/60 text-[11px] font-semibold text-brand">
                  {i + 1}
                </div>
                <p className="mt-2.5 text-center text-[10.5px] font-medium text-foreground leading-snug whitespace-pre-line">
                  {step.label}
                </p>
                {step.badge && (
                  <span className="mt-1 rounded bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold text-brand ring-1 ring-brand/20">
                    {step.badge}
                  </span>
                )}
                <p className="mt-0.5 text-[9.5px] text-muted-foreground">{step.date}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ SECTION 2 — SUSTAINABILITY SCORE ══════════ */}
      <section
        className="rounded-2xl border border-border bg-card/40 p-6"
        style={{ animation: 'fade-up 0.45s ease 0.12s both' }}
      >
        <SectionHeader
          eyebrow="Sustainability Score"
          title="Seller tier &amp; achievements"
          Icon={IconAward}
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[auto_1fr]">

          {/* Left — Ring + tier badge + formula */}
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-secondary ring-1 ring-border p-6 min-w-[260px]">
            <ProgressRing value={score} />

            {/* Tier badge — no emoji, just refined text */}
            <div
              className="inline-flex items-center gap-2.5 rounded-full px-6 py-2 text-xs font-bold uppercase tracking-[0.15em]"
              style={{
                background: 'linear-gradient(110deg,#E0DEDD 0%,#F2F1EF 30%,#C8C6C4 55%,#EEECEA 80%,#D0CECE 100%)',
                backgroundSize: '300% 100%',
                color: '#2A2929',
                boxShadow: '0 2px 14px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
                animation: 'shimmer 3.5s ease infinite',
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: currentTier.color, boxShadow: `0 0 6px ${currentTier.color}` }}
              />
              {currentTier.name}
            </div>

            {nextTier ? (
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                Need{' '}
                <span className="font-semibold text-brand">{nextTier.min - Math.round(score)} more points</span>{' '}
                to reach {nextTier.name}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                Highest tier — <span className="font-semibold text-brand">Elite Seller</span> status
              </p>
            )}

            {/* Formula */}
            <div className="flex items-center gap-1.5 rounded-xl bg-card px-4 py-2.5 ring-1 ring-border w-full justify-center">
              <span className="font-mono text-xs text-muted-foreground">(28+9+6) ÷ 47 × 100</span>
              <span className="text-xs text-border">=</span>
              <span className="font-mono text-sm font-bold text-brand">91.5</span>
            </div>
          </div>

          {/* Right — Tier ladder + Achievements */}
          <div className="flex flex-col gap-4">

            {/* Tier ladder */}
            <div className="rounded-2xl bg-secondary ring-1 ring-border p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                Tier Ladder
              </p>
              <div className="grid grid-cols-4 gap-2">
                {TIERS.map((tier) => {
                  const active = tier.name === currentTier.name;
                  return (
                    <div
                      key={tier.name}
                      className={`rounded-xl p-3 text-center transition-all ${
                        active ? 'bg-brand/10 ring-1 ring-brand/40' : 'bg-card ring-1 ring-border'
                      }`}
                    >
                      <div
                        className="mx-auto mb-2.5 h-0.5 w-8 rounded-full"
                        style={{ background: active ? tier.color : `${tier.color}55` }}
                      />
                      <p className={`text-[9px] font-bold uppercase tracking-widest ${
                        active ? 'text-brand' : 'text-muted-foreground'
                      }`}>
                        {tier.name}
                      </p>
                      <p className="text-[8.5px] text-muted-foreground mt-0.5 tabular-nums">{tier.range}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Achievements */}
            <div className="rounded-2xl bg-secondary ring-1 ring-border p-4 flex-1">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Achievements
                </p>
                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[10px] font-medium text-brand ring-1 ring-brand/20">
                  3 Unlocked
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {ACHIEVEMENTS.map((ach, i) => (
                  <div
                    key={ach.name}
                    className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-border transition-all hover:ring-brand/30 hover:bg-brand/5"
                    style={{ animation: `fade-up 0.5s ease ${0.18 + i * 0.06}s both` }}
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 ring-1 ring-brand/20">
                      <IconCheck className="w-3.5 h-3.5 text-brand" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{ach.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{ach.desc}</p>
                    </div>
                    <span className="flex-shrink-0 rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand ring-1 ring-brand/20">
                      Unlocked
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}
