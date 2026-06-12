import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Placeholder } from '@/components/placeholder';

const rows = [
  { id: 'R-1042', item: 'Wireless Headphones', grade: 'good', path: 'local-resale' },
  { id: 'R-1043', item: 'Yoga Mat', grade: 'like-new', path: 'donate' },
  { id: 'R-1044', item: 'Blender (motor fault)', grade: 'poor', path: 'recycle' },
];

export default function SellerReturnsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-white">Returns queue</h1>
      <p className="mt-2 text-muted">Returns graded at the source, with their routed path.</p>

      <Card className="mt-8 overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-700 text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Return</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Grade</th>
              <th className="px-4 py-3 font-medium">Routed path</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-navy-700">
                <td className="px-4 py-3 text-white">{r.id}</td>
                <td className="px-4 py-3 text-muted">{r.item}</td>
                <td className="px-4 py-3">
                  <Badge tone="neutral">{r.grade}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone="accent">{r.path}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-8">
        <Placeholder
          spec="007"
          willDo="Load the real returns queue with filtering, bulk actions, and per-item Bridge decisions."
        />
      </div>
    </div>
  );
}
