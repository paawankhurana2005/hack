import { Placeholder } from '@/components/placeholder';

export default function SellerInventoryPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-white">Inventory</h1>
      <p className="mt-2 text-muted">Items in their second life, by condition and path.</p>

      <div className="mt-8">
        <Placeholder
          spec="007"
          willDo="Show second-life inventory with grades, health cards, and current routing status."
        />
      </div>
    </div>
  );
}
