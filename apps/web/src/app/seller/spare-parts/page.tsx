'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';

// ─── Types ─────────────────────────────────────────────────────────────────
type PartStatus = 'sold' | 'available';
type ProductStatus = 'queued' | 'analyzing' | 'listed';
type AnalysisStep = 'scanning' | 'damage' | 'parts' | 'pricing' | 'listing' | 'complete';

interface DamageArea {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  severity: 'critical' | 'moderate';
}

interface Part {
  id: string;
  name: string;
  price: number;
  condition: 'Excellent' | 'Good' | 'Fair';
  confidence: number;
  status: PartStatus;
}

interface Product {
  id: string;
  name: string;
  returnId: string;
  imageUrl: string;
  internalImageUrl?: string;
  category: string;
  grade: 'C' | 'Salvage';
  issue: string;
  aiReasoning: string;
  damageAreas: DamageArea[];
  parts: Part[];
  status: ProductStatus;
  totalValue: number;
}

// ─── Data ──────────────────────────────────────────────────────────────────
const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'sp-q1',
    name: 'Sony WH-1000XM5 Headphones',
    returnId: 'RET-2026-900001',
    imageUrl: '/catalog/wh1000xm5.jpg',
    internalImageUrl: '/catalog/wh1000xm5-pcb.jpg',
    category: 'Audio',
    grade: 'Salvage',
    issue: 'Left ear cup cracked — internal circuit exposed to moisture',
    aiReasoning:
      'Multimodal scan detected irreparable damage on left ear assembly (73% fractured). Right ear unit, ANC chip, and headband pass functional verification.',
    damageAreas: [
      { label: 'Driver membrane', x: 20, y: 14, w: 58, h: 64, severity: 'critical' },
      { label: 'Flex cable — moisture', x: 32, y: 70, w: 34, h: 22, severity: 'moderate' },
    ],
    parts: [
      { id: 'q1p1', name: 'Right Ear Cup Assembly', price: 2800, condition: 'Excellent', confidence: 0.94, status: 'available' },
      { id: 'q1p2', name: 'ANC Chip Module', price: 1900, condition: 'Good', confidence: 0.89, status: 'available' },
      { id: 'q1p3', name: 'Headband + Padding', price: 750, condition: 'Good', confidence: 0.91, status: 'available' },
      { id: 'q1p4', name: 'USB-C Charging Board', price: 420, condition: 'Excellent', confidence: 0.96, status: 'available' },
      { id: 'q1p5', name: 'Carry Case (Pristine)', price: 380, condition: 'Excellent', confidence: 0.99, status: 'available' },
    ],
    status: 'queued',
    totalValue: 6250,
  },
  {
    id: 'sp-q3',
    name: 'Samsung Galaxy S23',
    returnId: 'RET-2026-900003',
    imageUrl: '/catalog/galaxy-phone.jpg',
    category: 'Smartphone',
    grade: 'C',
    issue: 'Screen shattered, back glass broken — dropped from 1.5 m',
    aiReasoning:
      'OLED screen and rear glass panel are non-recoverable. Snapdragon 8 Gen 2 motherboard, camera array, and battery pass voltage and continuity checks.',
    damageAreas: [
      { label: 'Shattered screen', x: 12, y: 5, w: 76, h: 58, severity: 'critical' },
      { label: 'Broken back glass', x: 12, y: 65, w: 76, h: 28, severity: 'moderate' },
    ],
    parts: [
      { id: 'q3p1', name: 'Snapdragon 8 Gen 2 Board', price: 4200, condition: 'Excellent', confidence: 0.91, status: 'available' },
      { id: 'q3p2', name: '50MP Triple Camera Module', price: 2800, condition: 'Good', confidence: 0.87, status: 'available' },
      { id: 'q3p3', name: '3900 mAh Battery Pack', price: 650, condition: 'Good', confidence: 0.89, status: 'available' },
      { id: 'q3p4', name: 'SIM Tray + Side Buttons', price: 180, condition: 'Excellent', confidence: 0.98, status: 'available' },
      { id: 'q3p5', name: 'Speaker + Mic Assembly', price: 420, condition: 'Good', confidence: 0.85, status: 'available' },
    ],
    status: 'queued',
    totalValue: 8250,
  },
  // Pre-listed items
  {
    id: 'sp-l1',
    name: 'Samsung 65" QLED TV',
    returnId: 'RET-TV-00234',
    imageUrl: '/catalog/samsung-tv.jpg',
    category: 'Television',
    grade: 'Salvage',
    issue: 'Screen cracked beyond repair — 73% of panel fractured',
    aiReasoning:
      'Multimodal scan detected irreparable screen fracture. Logic board, power supply, and A/V components intact and fully functional.',
    damageAreas: [],
    parts: [
      { id: 'l1p1', name: 'Main Logic Board', price: 3200, condition: 'Excellent', confidence: 0.95, status: 'sold' },
      { id: 'l1p2', name: 'HDMI Port Assembly', price: 850, condition: 'Good', confidence: 0.88, status: 'available' },
      { id: 'l1p3', name: 'Remote Control', price: 650, condition: 'Excellent', confidence: 0.97, status: 'available' },
      { id: 'l1p4', name: 'Power Supply Unit', price: 1400, condition: 'Excellent', confidence: 0.92, status: 'sold' },
      { id: 'l1p5', name: 'Speaker Set (2×)', price: 900, condition: 'Good', confidence: 0.85, status: 'available' },
    ],
    status: 'listed',
    totalValue: 7000,
  },
  {
    id: 'sp-l2',
    name: 'LG 8 kg Front Load Washer',
    returnId: 'RET-WM-00189',
    imageUrl: '/catalog/lg-washer.jpg',
    category: 'Appliance',
    grade: 'Salvage',
    issue: 'Motor seized — drum completely non-functional',
    aiReasoning:
      'Motor winding failure confirmed. Drum assembly, control panel, and all hydraulic components are undamaged and pass functional tests.',
    damageAreas: [],
    parts: [
      { id: 'l2p1', name: 'Drum Assembly', price: 2800, condition: 'Excellent', confidence: 0.93, status: 'sold' },
      { id: 'l2p2', name: 'Control Panel + Display', price: 1900, condition: 'Good', confidence: 0.87, status: 'available' },
      { id: 'l2p3', name: 'Door Gasket + Hinge', price: 600, condition: 'Good', confidence: 0.90, status: 'available' },
      { id: 'l2p4', name: 'Water Inlet Valve', price: 450, condition: 'Excellent', confidence: 0.94, status: 'sold' },
      { id: 'l2p5', name: 'Drain Pump', price: 750, condition: 'Good', confidence: 0.88, status: 'available' },
    ],
    status: 'listed',
    totalValue: 6500,
  },
  {
    id: 'sp-l3',
    name: 'Bosch Dishwasher Series 4',
    returnId: 'RET-DW-00301',
    imageUrl: '/catalog/bosch-dishwasher.jpg',
    category: 'Appliance',
    grade: 'Salvage',
    issue: 'Cabinet warped from flood damage — internals pristine',
    aiReasoning:
      'Exterior cabinet structurally unusable. Wash pump motor, heating element, and all internal electronics are in pristine condition.',
    damageAreas: [],
    parts: [
      { id: 'l3p1', name: 'Wash Pump Motor', price: 3500, condition: 'Excellent', confidence: 0.96, status: 'available' },
      { id: 'l3p2', name: 'Heating Element', price: 1200, condition: 'Good', confidence: 0.91, status: 'sold' },
      { id: 'l3p3', name: 'Spray Arm Set', price: 800, condition: 'Excellent', confidence: 0.95, status: 'available' },
      { id: 'l3p4', name: 'Control Module', price: 2100, condition: 'Good', confidence: 0.89, status: 'available' },
      { id: 'l3p5', name: 'Cutlery Basket Set', price: 400, condition: 'Excellent', confidence: 0.98, status: 'sold' },
    ],
    status: 'listed',
    totalValue: 8000,
  },
];

// ─── Analysis log builder ──────────────────────────────────────────────────
interface AnalysisLogs {
  scanLines: string[];
  damageLines: string[];
  partLines: string[];
  pricingLines: string[];
  listingLines: string[];
}

function buildAnalysisLogs(p: Product): AnalysisLogs {
  return {
    scanLines: [
      '[INIT] AI Grading Engine v2.3.1 initialized',
      `[SCAN] Loading return package: ${p.returnId}`,
      `[SCAN] Product identified: ${p.name}`,
      '[SCAN] Processing 3 inspection frames...',
      '[SCAN] Frame 1/3 — front view → analyzed ✓',
      '[SCAN] Frame 2/3 — side view → analyzed ✓',
      '[SCAN] Frame 3/3 — rear view → analyzed ✓',
    ],
    damageLines: [
      '[DMGE] Running multimodal damage classifier...',
      `[DMGE] Critical region detected → ${p.damageAreas[0]?.label ?? 'primary fault zone'}`,
      `[DMGE] Classification: ${p.issue}`,
      p.damageAreas.length > 1
        ? `[DMGE] Secondary zone detected → ${p.damageAreas[1]?.label ?? ''}`
        : '[DMGE] No secondary damage regions',
      `[DMGE] Condition grade: ${p.grade} — whole-unit resale not viable`,
    ],
    partLines: p.parts.map(
      (pt) => `[PART] ${pt.name} → ✓ VIABLE (${Math.round(pt.confidence * 100)}% conf.)`,
    ),
    pricingLines: [
      '[PRIC] Querying Amazon live market data...',
      ...p.parts.slice(0, 3).map((pt) => {
        const median = Math.round(pt.price * 0.92);
        const count = Math.round(pt.confidence * 25) + 6;
        return `[PRIC] ${pt.name}: ${count} listings, median ₹${median.toLocaleString('en-IN')} → set ₹${pt.price.toLocaleString('en-IN')}`;
      }),
      `[PRIC] ✓ Total value recovered: ₹${p.totalValue.toLocaleString('en-IN')} (vs ₹0 on write-off)`,
    ],
    listingLines: [
      '[LIST] Generating Amazon marketplace listings...',
      `[LIST] ${p.parts.length} spare parts listed with Product Health Cards`,
      '[LIST] ✓ All listings live — buyers can purchase immediately',
    ],
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────
const STEP_LABELS: Record<Exclude<AnalysisStep, 'complete'>, string> = {
  scanning: 'Scanning Images',
  damage: 'Damage Assessment',
  parts: 'Part Identification',
  pricing: 'Market Pricing',
  listing: 'Listing on Amazon',
};

const STEP_ORDER: Exclude<AnalysisStep, 'complete'>[] = [
  'scanning',
  'damage',
  'parts',
  'pricing',
  'listing',
];

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function logLineColor(line: string): string {
  if (line.includes('✓') || line.includes('[DONE]')) return 'text-green-400';
  if (line.startsWith('[DMGE]')) return 'text-orange-400';
  if (line.startsWith('[PRIC]')) return 'text-sky-400';
  if (line.startsWith('[LIST]')) return 'text-violet-400';
  if (line.startsWith('[INIT]')) return 'text-slate-400';
  return 'text-slate-300';
}

function categoryIcon(category: string): string {
  if (category === 'Television') return '📺';
  if (category === 'Appliance') return '🔧';
  if (category === 'Audio') return '🎧';
  if (category === 'Camera') return '📷';
  if (category === 'Smartphone') return '📱';
  return '📦';
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function SparePartsPage() {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [activeTab, setActiveTab] = useState<'queue' | 'listed'>('queue');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState<AnalysisStep>('scanning');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [visiblePartIds, setVisiblePartIds] = useState<Set<string>>(new Set());
  const [damageVisible, setDamageVisible] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Auto-scroll log terminal
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  // Cleanup on unmount
  useEffect(() => {
    return () => timeoutsRef.current.forEach(clearTimeout);
  }, []);

  const startAnalysis = useCallback((product: Product) => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    setAnalyzingId(product.id);
    setAnalysisStep('scanning');
    setLogLines([]);
    setVisiblePartIds(new Set());
    setDamageVisible(false);
    setShowPrices(false);
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, status: 'analyzing' as ProductStatus } : p)),
    );

    const L = buildAnalysisLogs(product);
    const add = (fn: () => void, delay: number) => {
      const t = setTimeout(fn, delay);
      timeoutsRef.current.push(t);
    };

    let cursor = 0;

    // Phase 1: Scanning (0 → ~1600 ms)
    L.scanLines.forEach((line, i) => {
      add(() => setLogLines((prev) => [...prev, line]), cursor + i * 200);
    });
    cursor += L.scanLines.length * 200 + 300;

    // Phase 2: Damage detection
    add(() => setAnalysisStep('damage'), cursor);
    L.damageLines.forEach((line, i) => {
      add(() => setLogLines((prev) => [...prev, line]), cursor + 200 + i * 300);
    });
    add(() => setDamageVisible(true), cursor + 500);
    cursor += 300 + L.damageLines.length * 300 + 200;

    // Phase 3: Part identification (each part ~600 ms apart)
    add(() => setAnalysisStep('parts'), cursor);
    product.parts.forEach((part, i) => {
      add(() => {
        setLogLines((prev) => [...prev, L.partLines[i] ?? '']);
        setVisiblePartIds((prev) => new Set([...prev, part.id]));
      }, cursor + 200 + i * 600);
    });
    cursor += 200 + product.parts.length * 600 + 300;

    // Phase 4: Market pricing
    add(() => setAnalysisStep('pricing'), cursor);
    L.pricingLines.forEach((line, i) => {
      add(() => setLogLines((prev) => [...prev, line]), cursor + 200 + i * 400);
    });
    add(() => setShowPrices(true), cursor + 600);
    cursor += 200 + L.pricingLines.length * 400 + 200;

    // Phase 5: Listing
    add(() => setAnalysisStep('listing'), cursor);
    L.listingLines.forEach((line, i) => {
      add(() => setLogLines((prev) => [...prev, line]), cursor + 200 + i * 300);
    });
    cursor += 200 + L.listingLines.length * 300 + 300;

    // Complete
    add(() => {
      setAnalysisStep('complete');
      setLogLines((prev) => [
        ...prev,
        `[DONE] ✓ Analysis complete — ${formatINR(product.totalValue)} recovered`,
      ]);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, status: 'listed' as ProductStatus } : p,
        ),
      );
    }, cursor);
  }, []);

  const markPartSold = useCallback((productId: string, partId: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              parts: p.parts.map((pt) =>
                pt.id === partId ? { ...pt, status: 'sold' as PartStatus } : pt,
              ),
            }
          : p,
      ),
    );
  }, []);

  const handleViewListed = useCallback(() => {
    setActiveTab('listed');
    setAnalyzingId(null);
  }, []);

  // Derived
  const queuedProducts = products.filter((p) => p.status === 'queued');
  const analyzingProduct = analyzingId ? products.find((p) => p.id === analyzingId) ?? null : null;
  const listedProducts = products.filter((p) => p.status === 'listed');
  const allListedParts = listedProducts.flatMap((p) => p.parts);
  const soldParts = allListedParts.filter((p) => p.status === 'sold');
  const totalRecovered = listedProducts.reduce((s, p) => s + p.totalValue, 0);
  const queueTabCount =
    queuedProducts.length + (analyzingProduct?.status === 'analyzing' ? 1 : 0);
  const currentStepIdx = STEP_ORDER.indexOf(analysisStep as Exclude<AnalysisStep, 'complete'>);

  return (
    <div>
      {/* Header */}
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Spare Parts
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Spare Parts Extraction
      </h1>
      <p className="mt-2 text-muted-foreground">
        AI grades returns at the doorstep. When a product is too damaged to resell whole, it
        identifies and lists high-value components individually on Amazon.
      </p>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-4 overflow-hidden rounded-2xl bg-secondary ring-1 ring-border">
        {[
          { label: 'In Queue', value: queueTabCount.toString() },
          { label: 'Parts Listed', value: allListedParts.length.toString() },
          { label: 'Value Recovered', value: formatINR(totalRecovered) },
          { label: 'Parts Sold', value: `${soldParts.length}/${allListedParts.length}` },
        ].map((s, i) => (
          <div
            key={s.label}
            className={`py-5 text-center ${i > 0 ? 'border-l border-border' : ''}`}
          >
            <p className="text-2xl font-black tracking-tight tabular-nums text-brand">{s.value}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-xl bg-secondary p-1 ring-1 ring-border">
        {(['queue', 'listed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'queue'
              ? `Queue (${queueTabCount})`
              : `Listed Parts (${listedProducts.length})`}
          </button>
        ))}
      </div>

      {/* ── Queue Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Analysis panel */}
          {analyzingProduct && (
            <div
              className="overflow-hidden rounded-2xl bg-card ring-2 ring-brand/40"
              style={{ animation: 'fade-up 0.4s ease both' }}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between border-b border-border/60 bg-brand/5 px-6 py-4">
                <div className="flex items-center gap-3">
                  {analysisStep !== 'complete' && (
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
                    </span>
                  )}
                  <div>
                    <p className="font-semibold text-foreground">
                      {analysisStep === 'complete' ? 'Analysis Complete' : 'AI Analysis in Progress'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {analyzingProduct.name} · {analyzingProduct.returnId}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 font-mono text-xs font-semibold ${
                    analysisStep === 'complete'
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-brand/10 text-brand'
                  }`}
                >
                  {analysisStep === 'complete'
                    ? '✓ Complete'
                    : STEP_LABELS[analysisStep as Exclude<AnalysisStep, 'complete'>]}
                </span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-border/60" style={{ height: 460 }}>
                {/* Left: Image + damage overlay + revealed parts */}
                <div className="flex flex-col gap-4 overflow-y-auto p-5">
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Product Image — Damage Detection
                    </p>
                    <div className="relative h-40 overflow-hidden rounded-xl bg-secondary ring-1 ring-border">
                      {(analyzingProduct.internalImageUrl ?? analyzingProduct.imageUrl) ? (
                        <Image
                          src={analyzingProduct.internalImageUrl ?? analyzingProduct.imageUrl}
                          alt={`${analyzingProduct.name} — internal view`}
                          fill
                          className="object-cover object-center"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl text-muted-foreground">
                          {categoryIcon(analyzingProduct.category)}
                        </div>
                      )}

                      {/* Scan grid overlay */}
                      {analysisStep === 'scanning' && (
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            backgroundImage:
                              'linear-gradient(rgba(255,153,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,153,0,0.08) 1px, transparent 1px)',
                            backgroundSize: '24px 24px',
                          }}
                        />
                      )}

                      {/* Moving scan line */}
                      {analysisStep === 'scanning' && (
                        <div
                          className="pointer-events-none absolute inset-x-0 h-px"
                          style={{
                            background:
                              'linear-gradient(90deg, transparent, rgba(255,153,0,0.9), transparent)',
                            boxShadow: '0 0 8px rgba(255,153,0,0.6)',
                            animation: 'scan-vertical 1.5s linear infinite',
                          }}
                        />
                      )}

                      {/* Damage area overlays — corner-bracket detection markers */}
                      {damageVisible &&
                        analyzingProduct.damageAreas.map((area, i) => {
                          const isCritical = area.severity === 'critical';
                          const color = isCritical ? '#ef4444' : '#fb923c';
                          return (
                            <div
                              key={i}
                              className="pointer-events-none absolute"
                              style={{
                                left: `${area.x}%`,
                                top: `${area.y}%`,
                                width: `${area.w}%`,
                                height: `${area.h}%`,
                                animation: 'fade-in 0.5s ease both',
                                animationDelay: `${i * 400}ms`,
                              }}
                            >
                              {/* Radial glow fill */}
                              <div
                                className="absolute inset-0"
                                style={{
                                  background: `radial-gradient(ellipse at 50% 50%, ${isCritical ? 'rgba(239,68,68,0.22)' : 'rgba(251,146,60,0.18)'} 0%, transparent 70%)`,
                                }}
                              />
                              {/* Corner brackets */}
                              <div className="absolute left-0 top-0 h-3 w-3" style={{ borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
                              <div className="absolute right-0 top-0 h-3 w-3" style={{ borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
                              <div className="absolute bottom-0 left-0 h-3 w-3" style={{ borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
                              <div className="absolute bottom-0 right-0 h-3 w-3" style={{ borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
                              {/* Centre pulse dot */}
                              <div
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                                style={{ width: 8, height: 8 }}
                              >
                                <span
                                  className="absolute inset-0 animate-ping rounded-full"
                                  style={{ backgroundColor: color, opacity: 0.5 }}
                                />
                                <span
                                  className="absolute inset-0 rounded-full"
                                  style={{ backgroundColor: color, boxShadow: `0 0 6px 2px ${color}60` }}
                                />
                              </div>
                              {/* Label */}
                              <div
                                className="absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-white"
                                style={{ backgroundColor: color }}
                              >
                                {area.label}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>


                  {/* Revealed parts list */}
                  {visiblePartIds.size > 0 && (
                    <div style={{ animation: 'fade-in 0.4s ease both' }}>
                      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Extracted Parts ({visiblePartIds.size}/{analyzingProduct.parts.length})
                      </p>
                      <div className="flex flex-col gap-1">
                        {analyzingProduct.parts
                          .filter((pt) => visiblePartIds.has(pt.id))
                          .map((pt) => (
                            <div
                              key={pt.id}
                              className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs"
                              style={{ animation: 'fade-in 0.3s ease both' }}
                            >
                              <span className="text-foreground">{pt.name}</span>
                              <span className="font-mono font-semibold tabular-nums text-brand">
                                {showPrices ? formatINR(pt.price) : '—'}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Step tracker + log terminal */}
                <div className="flex flex-col gap-5 overflow-y-auto p-5">
                  {/* Step tracker */}
                  <div>
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Analysis Pipeline
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {STEP_ORDER.map((step, i) => {
                        const isDone =
                          analysisStep === 'complete' || currentStepIdx > i;
                        const isActive =
                          analysisStep !== 'complete' && currentStepIdx === i;
                        return (
                          <div key={step} className="flex items-center gap-3">
                            <div
                              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                isDone
                                  ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                                  : isActive
                                    ? 'bg-brand text-brand-foreground ring-2 ring-brand/30'
                                    : 'bg-secondary text-muted-foreground ring-1 ring-border'
                              }`}
                            >
                              {isDone ? '✓' : i + 1}
                            </div>
                            <span
                              className={`text-sm ${
                                isDone
                                  ? 'text-muted-foreground line-through'
                                  : isActive
                                    ? 'font-medium text-foreground'
                                    : 'text-muted-foreground'
                              }`}
                            >
                              {STEP_LABELS[step]}
                            </span>
                            {isActive && (
                              <div className="ml-auto size-1.5 animate-pulse rounded-full bg-brand" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Log terminal */}
                  <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                    <div className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-900 px-3 py-2">
                      <div className="size-2.5 rounded-full bg-red-500/70" />
                      <div className="size-2.5 rounded-full bg-yellow-500/70" />
                      <div className="size-2.5 rounded-full bg-green-500/70" />
                      <span className="ml-2 font-mono text-[10px] text-slate-500">
                        reloop-ai-grading
                      </span>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
                      {logLines.map((line, i) => (
                        <div
                          key={i}
                          className={logLineColor(line)}
                          style={{ animation: 'fade-in 0.2s ease both' }}
                        >
                          {line}
                        </div>
                      ))}
                      {logLines.length === 0 && (
                        <span className="text-slate-600">Initializing...</span>
                      )}
                      <div ref={logEndRef} />
                    </div>
                  </div>

                </div>
              </div>

              {/* Complete banner — outside the fixed-height grid so the page never jumps */}
              {analysisStep === 'complete' && (
                <div
                  className="flex items-center justify-between border-t border-green-500/20 bg-green-500/5 px-6 py-4"
                  style={{ animation: 'fade-up 0.4s ease both' }}
                >
                  <div>
                    <p className="font-semibold text-green-400">✓ Analysis Complete</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {analyzingProduct.parts.length} parts identified ·{' '}
                      {formatINR(analyzingProduct.totalValue)} recoverable value
                    </p>
                  </div>
                  <button
                    onClick={handleViewListed}
                    className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
                  >
                    View Listed Parts →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Queue items */}
          {queuedProducts.length === 0 && !analyzingProduct ? (
            <div className="rounded-2xl bg-card p-12 text-center ring-1 ring-border">
              <p className="text-muted-foreground">
                All items analyzed.{' '}
                <button
                  onClick={() => setActiveTab('listed')}
                  className="text-brand underline underline-offset-2"
                >
                  View listed parts →
                </button>
              </p>
            </div>
          ) : (
            queuedProducts.map((product, i) => (
              <div
                key={product.id}
                className="overflow-hidden rounded-2xl bg-card ring-1 ring-border"
                style={{
                  animation: 'fade-up 0.4s ease both',
                  animationDelay: `${i * 60}ms`,
                }}
              >
                <div className="flex gap-5 p-5">
                  {/* Product image */}
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-secondary ring-1 ring-border">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-3xl">
                        {categoryIcon(product.category)}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{product.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {product.returnId}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                          product.grade === 'Salvage'
                            ? 'bg-red-500/15 text-red-400'
                            : 'bg-orange-500/15 text-orange-400'
                        }`}
                      >
                        Grade {product.grade}
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {product.issue}
                    </p>

                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {product.parts.length} parts · est. {formatINR(product.totalValue)}
                      </span>
                      <button
                        onClick={() => startAnalysis(product)}
                        className="ml-auto rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
                      >
                        Analyze with AI
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Listed Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'listed' && (
        <div className="mt-4 flex flex-col gap-5">
          {listedProducts.length === 0 ? (
            <div className="rounded-2xl bg-card p-12 text-center ring-1 ring-border">
              <p className="text-muted-foreground">
                No parts listed yet.{' '}
                <button
                  onClick={() => setActiveTab('queue')}
                  className="text-brand underline underline-offset-2"
                >
                  Analyze items from the Queue →
                </button>
              </p>
            </div>
          ) : (
            listedProducts.map((product, i) => {
              const partsValue = product.parts.reduce((s, p) => s + p.price, 0);
              const soldCount = product.parts.filter((p) => p.status === 'sold').length;

              return (
                <div
                  key={product.id}
                  className="overflow-hidden rounded-2xl bg-card ring-1 ring-border"
                  style={{
                    animation: 'fade-up 0.4s ease both',
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  {/* Card header */}
                  <div className="border-b border-border/60 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        {product.imageUrl ? (
                          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-secondary ring-1 ring-border">
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-2xl ring-1 ring-border">
                            {categoryIcon(product.category)}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-foreground">{product.name}</p>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {product.returnId}
                          </p>
                          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
                            {product.aiReasoning}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Value Recovered
                        </p>
                        <div className="mt-1 flex items-baseline justify-end gap-2">
                          <span className="text-xs text-muted-foreground line-through">₹0</span>
                          <span className="text-xl font-black tabular-nums text-brand">
                            {formatINR(partsValue)}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {soldCount}/{product.parts.length} parts sold
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Parts table */}
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60">
                      <tr>
                        {['Part Name', 'Condition', 'AI Confidence', 'Price', 'Status'].map(
                          (h) => (
                            <th
                              key={h}
                              className={`px-5 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground ${h === 'Part Name' || h === 'Condition' || h === 'AI Confidence' ? 'text-left' : 'text-right'}`}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {product.parts.map((part) => (
                        <tr
                          key={part.id}
                          className="border-t border-border transition-colors hover:bg-secondary/40"
                        >
                          <td className="px-5 py-3 text-foreground">{part.name}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`text-xs font-semibold ${
                                part.condition === 'Excellent'
                                  ? 'text-green-400'
                                  : part.condition === 'Good'
                                    ? 'text-yellow-400'
                                    : 'text-orange-400'
                              }`}
                            >
                              {part.condition}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full rounded-full bg-brand"
                                  style={{ width: `${Math.round(part.confidence * 100)}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                {Math.round(part.confidence * 100)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-mono tabular-nums text-foreground">
                            {formatINR(part.price)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {part.status === 'sold' ? (
                              <span className="rounded-md bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">
                                Sold
                              </span>
                            ) : (
                              <button
                                onClick={() => markPartSold(product.id, part.id)}
                                className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-brand/15 hover:text-brand"
                              >
                                Mark Sold
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Card footer */}
                  <div className="flex items-center justify-between border-t border-border/60 bg-secondary/20 px-6 py-3">
                    <p className="text-xs text-muted-foreground">
                      {soldCount} of {product.parts.length} parts sold
                    </p>
                    <p className="font-mono text-xs font-semibold text-brand">
                      Total: {formatINR(partsValue)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
