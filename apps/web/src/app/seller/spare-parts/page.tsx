'use client';

// ─── Demo data ────────────────────────────────────────────────────────────────
type PartStatus = 'sold' | 'available';

interface Part {
  name: string;
  price: number;
  status: PartStatus;
}

interface ExtractedProduct {
  name: string;
  returnId: string;
  issue: string;
  aiDecision: string;
  parts: Part[];
}

const PRODUCTS: ExtractedProduct[] = [
  {
    name: 'Samsung 65" QLED TV',
    returnId: 'RET-TV-00234',
    issue: 'Screen cracked beyond repair',
    aiDecision: 'Too damaged to resell whole, extracting parts',
    parts: [
      { name: 'Main Logic Board', price: 3200, status: 'sold' },
      { name: 'HDMI Port Assembly', price: 850, status: 'available' },
      { name: 'Remote Control', price: 650, status: 'available' },
      { name: 'Power Supply Unit', price: 1400, status: 'sold' },
      { name: 'Speaker Set (2×)', price: 900, status: 'available' },
    ],
  },
  {
    name: 'LG 8kg Front Load Washing Machine',
    returnId: 'RET-WM-00189',
    issue: 'Motor seized',
    aiDecision: 'Motor damaged, rest of unit salvageable',
    parts: [
      { name: 'Drum Assembly', price: 2800, status: 'sold' },
      { name: 'Control Panel + Display', price: 1900, status: 'available' },
      { name: 'Door Gasket + Hinge', price: 600, status: 'available' },
      { name: 'Water Inlet Valve', price: 450, status: 'sold' },
      { name: 'Drain Pump', price: 750, status: 'available' },
    ],
  },
  {
    name: 'Bosch Dishwasher',
    returnId: 'RET-DW-00301',
    issue: 'Cabinet warped, internals fine',
    aiDecision: 'Exterior unusable, internal components high value',
    parts: [
      { name: 'Wash Pump Motor', price: 3500, status: 'available' },
      { name: 'Heating Element', price: 1200, status: 'sold' },
      { name: 'Spray Arm Set', price: 800, status: 'available' },
      { name: 'Control Module', price: 2100, status: 'available' },
      { name: 'Cutlery Basket Set', price: 400, status: 'sold' },
    ],
  },
];

const PIPELINE_STEPS = [
  'Return Received',
  'AI Damage Assessment',
  'Extraction Decision',
  'Parts Catalogued',
  'Listed on Amazon',
  'Buyers Matched',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SparePartsPage() {
  const allParts = PRODUCTS.flatMap((p) => p.parts);
  const totalValue = PRODUCTS.reduce(
    (s, p) => s + p.parts.reduce((ps, pt) => ps + pt.price, 0),
    0,
  );
  const soldParts = allParts.filter((p) => p.status === 'sold');

  return (
    <div>
      {/* Page header */}
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
        Seller / Spare Parts
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Spare Parts Extraction
      </h1>
      <p className="mt-2 text-muted-foreground">
        When a product is too damaged to resell whole, AI extracts high-value components and lists them individually on Amazon.
      </p>

      {/* Summary stats */}
      <div className="mt-8 grid grid-cols-4 overflow-hidden rounded-2xl bg-secondary ring-1 ring-border">
        {[
          { label: 'Products Extracted', value: PRODUCTS.length.toString() },
          { label: 'Parts Listed', value: allParts.length.toString() },
          { label: 'Value Recovered', value: formatINR(totalValue) },
          { label: 'Parts Sold', value: `${soldParts.length}/${allParts.length}` },
        ].map((s, i) => (
          <div key={s.label} className={`py-5 text-center ${i > 0 ? 'border-l border-border' : ''}`}>
            <p className="text-2xl font-black tracking-tight tabular-nums text-brand">{s.value}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Product cards */}
      <div className="mt-6 flex flex-col gap-5">
        {PRODUCTS.map((product, i) => {
          const partsValue = product.parts.reduce((s, p) => s + p.price, 0);
          const soldCount = product.parts.filter((p) => p.status === 'sold').length;

          return (
            <div
              key={product.returnId}
              className="overflow-hidden rounded-2xl bg-card ring-1 ring-border"
              style={{ animation: 'fade-up 0.45s ease both', animationDelay: `${i * 80}ms` }}
            >
              {/* Card header */}
              <div className="border-b border-border/60 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground">{product.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{product.returnId}</p>
                  </div>

                  {/* Before / after value highlight */}
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
                  </div>
                </div>

                {/* AI decision banner */}
                <div className="mt-4 flex items-start gap-3 rounded-xl bg-secondary px-4 py-3.5 ring-1 ring-border/60">
                  <span className="mt-0.5 text-base leading-none">🤖</span>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
                      AI Decision
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-foreground">{product.aiDecision}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Fault detected: {product.issue}</p>
                  </div>
                </div>
              </div>

              {/* Parts table */}
              <table className="w-full text-sm">
                <thead className="bg-secondary/60">
                  <tr>
                    <th className="px-6 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Part Name
                    </th>
                    <th className="px-6 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Price
                    </th>
                    <th className="px-6 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {product.parts.map((part) => (
                    <tr
                      key={part.name}
                      className="border-t border-border transition-colors hover:bg-secondary/40"
                    >
                      <td className="px-6 py-3 text-foreground">{part.name}</td>
                      <td className="px-6 py-3 text-right font-mono tabular-nums text-foreground">
                        {formatINR(part.price)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            part.status === 'sold'
                              ? 'bg-success/15 text-success'
                              : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {part.status === 'sold' ? 'Sold' : 'Available'}
                        </span>
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
        })}
      </div>

      {/* Pipeline step tracker */}
      <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-border">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Extraction Pipeline
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every extracted product follows this path — from return receipt to parts sold on Amazon.
        </p>

        <div className="mt-6 flex items-start">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step} className="flex flex-1 items-start">
              <div className="flex flex-col items-center text-center">
                <div
                  className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-foreground"
                  style={{ boxShadow: '0 0 0 4px oklch(0.82 0.17 88 / 0.15)' }}
                >
                  {i + 1}
                </div>
                <p className="mt-2.5 max-w-[72px] font-mono text-[9px] uppercase leading-tight tracking-wider text-muted-foreground">
                  {step}
                </p>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="mx-1 mt-4 h-px flex-1 bg-brand/35" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
