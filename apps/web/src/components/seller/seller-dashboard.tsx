'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';

// ─── Hardcoded demo data ──────────────────────────────────────────────────────
const DATA = {
  total: 47,
  rescued: 28,
  refurbished: 9,
  donated: 6,
  discarded: 4,
  weightKg: 1.2,
  co2PerUnit: 2.8,
};

const secondLife = DATA.rescued + DATA.refurbished + DATA.donated; // 43
const co2Saved   = secondLife * DATA.co2PerUnit;                   // 120.4
const landfill   = secondLife * DATA.weightKg;                     // 51.6
const score      = Math.round((secondLife / DATA.total) * 1000) / 10; // 91.5
const CIRC       = 2 * Math.PI * 54; // ~339.3 for r=54

const JOURNEY_STEPS = [
  { icon: '📦', label: 'Return\nInitiated',  date: 'Jun 3' },
  { icon: '🔍', label: 'AI Graded',         date: 'Jun 3', badge: 'Grade B' },
  { icon: '🏷️', label: 'Listed\nLocally',   date: 'Jun 4' },
  { icon: '🤝', label: 'Buyer\nFound',      date: 'Jun 5' },
  { icon: '✅', label: 'Delivered',         date: 'Jun 6' },
];

const TIERS = [
  { icon: '🥉', name: 'Bronze',   range: '0 – 40',   min: 0,  max: 40  },
  { icon: '🥈', name: 'Silver',   range: '41 – 65',  min: 41, max: 65  },
  { icon: '🥇', name: 'Gold',     range: '66 – 85',  min: 66, max: 85  },
  { icon: '💎', name: 'Platinum', range: '86 – 100', min: 86, max: 100 },
];

const ACHIEVEMENTS = [
  {
    icon: '🎯',
    name: 'First Local Rescue',
    desc: 'Rerouted first return to a verified local buyer',
    bg: 'bg-brand/10',
  },
  {
    icon: '🌿',
    name: '10 Products Saved',
    desc: 'Rescued 10+ products from landfill or warehouse disposal',
    bg: 'bg-brand/10',
  },
  {
    icon: '⭐',
    name: 'Zero Discard Week',
    desc: 'Completed a full 7-day window with zero products discarded',
    bg: 'bg-brand/10',
  },
];

// ─── Animated counter hook ────────────────────────────────────────────────────
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
    // Card background in the oklch theme ≈ #232F3E
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

  return <canvas ref={canvasRef} width={152} height={152} />;
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
    <div className="relative mx-auto w-48 h-48">
      <svg
        viewBox="0 0 120 120"
        className="w-full h-full"
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF9900" />
            <stop offset="100%" stopColor="#FFD060" />
          </linearGradient>
          <filter id="ringGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle
          cx="60" cy="60" r="54"
          fill="none"
          stroke="oklch(0.27 0.006 285)"
          strokeWidth="10"
        />
        {/* Fill */}
        <circle
          ref={ringRef}
          cx="60" cy="60" r="54"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          filter="url(#ringGlow)"
          style={{
            strokeDasharray: CIRC,
            strokeDashoffset: CIRC,
            transition: 'stroke-dashoffset 2s cubic-bezier(0.25,0.46,0.45,0.94)',
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black tracking-tighter text-foreground tabular-nums leading-none">
          {displayed}
        </span>
        <span className="text-sm font-medium text-muted-foreground mt-0.5">/100</span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Score
        </span>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export function SellerDashboard() {
  const cA = useCounter(secondLife,  0, 1500, 150);
  const cB = useCounter(co2Saved,    1, 1800, 280);
  const cC = useCounter(landfill,    1, 1800, 410);

  const currentTier = [...TIERS].reverse().find((t) => score >= t.min) ?? TIERS[0]!;
  const nextTier    = TIERS[TIERS.indexOf(currentTier) + 1];

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <span className="font-mono text-xs uppercase tracking-widest text-brand">
          Seller / Impact Overview
        </span>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          TechBazaar Pvt Ltd
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Return rescue performance and sustainability metrics at a glance.
        </p>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]">

        {/* ═══════════════ LEFT: IMPACT DASHBOARD ═══════════════ */}
        <div
          className="flex flex-col gap-4"
          style={{ animation: 'fade-up 0.45s ease both' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
              📊
            </div>
            <div>
              <p className="font-semibold text-foreground">Impact Dashboard</p>
              <p className="text-xs text-muted-foreground">Product rescue metrics for this cycle</p>
            </div>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-3 rounded-2xl bg-secondary ring-1 ring-border overflow-hidden">
            {[
              { val: '47',    label: 'Total Returns' },
              { val: '43',    label: 'Products Rescued' },
              { val: '91.5%', label: 'Recovery Rate' },
            ].map((s, i) => (
              <div
                key={s.label}
                className={`py-4 text-center ${i > 0 ? 'border-l border-border' : ''}`}
              >
                <p className="text-2xl font-black tracking-tight text-brand tabular-nums">{s.val}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                icon: '✨',
                val: cA,
                unit: '',
                label: 'Products got a\nsecond life',
                delay: '0.05s',
                top: 'bg-brand',
              },
              {
                icon: '🌿',
                val: cB,
                unit: ' kg',
                label: 'CO₂ saved vs\nwarehouse route',
                delay: '0.1s',
                top: 'bg-brand',
              },
              {
                icon: '♻️',
                val: cC,
                unit: ' kg',
                label: 'Landfill waste\nprevented',
                delay: '0.15s',
                top: 'bg-brand',
              },
            ].map((s) => (
              <div
                key={s.label}
                className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-border p-4"
                style={{ animation: `fade-up 0.5s ease ${s.delay} both` }}
              >
                {/* Top accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-0.5 ${s.top} opacity-80`} />
                <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-lg">
                  {s.icon}
                </div>
                <p className="text-3xl font-black tracking-tighter text-foreground tabular-nums leading-none">
                  {s.val}
                  <span className="text-base font-semibold text-muted-foreground">{s.unit}</span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Donut chart + legend */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Product fate breakdown
              </p>
              <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-[10px] font-semibold text-brand">
                47 total returns
              </span>
            </div>
            <div className="flex items-center gap-6">
              {/* Chart */}
              <div className="relative flex-shrink-0">
                <DonutChart />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-foreground leading-none">43</span>
                  <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    Rescued
                  </span>
                </div>
              </div>
              {/* Legend */}
              <ul className="flex flex-col gap-3 flex-1">
                {[
                  { color: '#FF9900', name: 'Rescued locally', n: 28,  pct: '59.6%' },
                  { color: '#2DD4BF', name: 'Refurbished',      n: 9,   pct: '19.1%' },
                  { color: '#60A5FA', name: 'Donated',          n: 6,   pct: '12.8%' },
                  { color: '#3D4B61', name: 'Discarded',        n: 4,   pct: '8.5%'  },
                ].map((row) => (
                  <li key={row.name} className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                      style={{ background: row.color }}
                    />
                    <span className="flex-1 text-sm text-foreground">{row.name}</span>
                    <span className="text-sm font-bold text-foreground tabular-nums">{row.n}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                      {row.pct}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* Product journey */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Product journey
              </p>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Sample · SKU #B4821
              </span>
            </div>
            {/* Track */}
            <div className="relative flex items-start">
              {/* Connector line */}
              <div className="pointer-events-none absolute top-5 left-[10%] right-[10%] h-0.5 bg-brand/30 rounded-full" />
              {JOURNEY_STEPS.map((step) => (
                <div key={step.label} className="relative z-10 flex flex-1 flex-col items-center">
                  {/* Dot */}
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-base"
                    style={{ boxShadow: '0 0 0 4px oklch(0.82 0.17 88 / 0.15)' }}
                  >
                    {step.icon}
                  </div>
                  {/* Info */}
                  <p className="mt-2 text-center text-[10.5px] font-semibold text-foreground leading-snug whitespace-pre-line">
                    {step.label}
                  </p>
                  {step.badge && (
                    <span className="mt-1 rounded bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold text-brand">
                      {step.badge}
                    </span>
                  )}
                  <p className="mt-0.5 text-[9.5px] text-muted-foreground">{step.date}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ═══════════════ RIGHT: SUSTAINABILITY SCORE ═══════════════ */}
        <div
          className="flex flex-col gap-4"
          style={{ animation: 'fade-up 0.45s ease 0.08s both' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
              🏆
            </div>
            <div>
              <p className="font-semibold text-foreground">Sustainability Score</p>
              <p className="text-xs text-muted-foreground">Based on rescue rate across all returns</p>
            </div>
          </div>

          {/* Ring + tier card */}
          <Card>
            {/* Ring */}
            <ProgressRing value={score} />

            {/* Tier badge */}
            <div className="mt-5 flex flex-col items-center gap-2">
              <div
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-black uppercase tracking-widest"
                style={{
                  background: 'linear-gradient(110deg,#E0DEDD 0%,#F2F1EF 30%,#C8C6C4 55%,#EEECEA 80%,#D0CECE 100%)',
                  backgroundSize: '300% 100%',
                  color: '#2A2929',
                  boxShadow: '0 2px 14px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
                  animation: 'shimmer 3.5s ease infinite',
                }}
              >
                {currentTier.icon} &nbsp;{currentTier.name}
              </div>
              {nextTier ? (
                <p className="text-xs text-muted-foreground text-center">
                  Need{' '}
                  <span className="font-semibold text-brand">{nextTier.min - Math.round(score)} more points</span>
                  {' '}to reach {nextTier.name}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  Highest tier achieved — <span className="font-semibold text-brand">Elite Seller</span> status
                </p>
              )}
            </div>

            {/* Score formula */}
            <div className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2.5">
              <span className="text-xs text-muted-foreground">(28+9+6) ÷ 47 × 100</span>
              <span className="text-xs text-border">=</span>
              <span className="text-sm font-black text-brand">91.5</span>
            </div>

            {/* Tier ladder */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {TIERS.map((tier) => {
                const active = tier.name === currentTier.name;
                return (
                  <div
                    key={tier.name}
                    className={`rounded-xl p-2.5 text-center transition-all ${
                      active
                        ? 'bg-brand/15 ring-1 ring-brand'
                        : 'bg-secondary ring-1 ring-border'
                    }`}
                  >
                    <p className="text-lg leading-none">{tier.icon}</p>
                    <p className={`mt-1.5 text-[9px] font-black uppercase tracking-wide ${active ? 'text-brand' : 'text-muted-foreground'}`}>
                      {tier.name}
                    </p>
                    <p className="text-[8.5px] text-muted-foreground mt-0.5">{tier.range}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Achievements */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Achievements
              </p>
              <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-[10px] font-semibold text-brand">
                3 Unlocked
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {ACHIEVEMENTS.map((ach, i) => (
                <div
                  key={ach.name}
                  className="flex items-center gap-3 rounded-xl bg-secondary p-3 ring-1 ring-border transition-all hover:ring-brand/40 hover:bg-brand/5"
                  style={{ animation: `fade-up 0.5s ease ${0.28 + i * 0.06}s both` }}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/15 text-xl">
                    {ach.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{ach.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{ach.desc}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-brand/15 px-2.5 py-0.5 text-[10px] font-bold text-brand">
                    ✓ Unlocked
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
