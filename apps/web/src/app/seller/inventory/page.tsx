import { Placeholder } from '@/components/placeholder';

export default function SellerInventoryPage() {
  return (
    <div>
      <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">Seller / Inventory</span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Inventory</h1>
      <p className="mt-2 text-muted-foreground">Items in their second life, by condition and path.</p>

      <div className="mt-8">
        <Placeholder
          spec="007"
          willDo="Show second-life inventory with grades, health cards, and current routing status."
        />
      </div>
    </div>
  );
}
