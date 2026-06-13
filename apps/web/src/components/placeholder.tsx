import { Badge } from './ui/badge';
import { Card } from './ui/card';

interface PlaceholderProps {
  /** Spec number this screen's real functionality will land in. */
  spec: string;
  /** What this screen will eventually do. */
  willDo: string;
}

/** Marks a screen as scaffold-only with no real functionality yet. */
export function Placeholder({ spec, willDo }: PlaceholderProps) {
  return (
    <Card className="border border-dashed border-border ring-0">
      <div className="flex items-center gap-3">
        <Badge tone="accent">Placeholder</Badge>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Coming in Spec {spec}
        </span>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{willDo}</p>
    </Card>
  );
}
