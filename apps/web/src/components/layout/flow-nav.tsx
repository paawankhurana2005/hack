import { Button } from '../ui/button';

interface FlowNavProps {
  prevHref?: string;
  nextHref?: string;
  nextLabel?: string;
}

/** Prev/next navigation that wires the placeholder flow screens together. */
export function FlowNav({ prevHref, nextHref, nextLabel = 'Continue' }: FlowNavProps) {
  return (
    <div className="mt-10 flex items-center justify-between">
      {prevHref ? (
        <Button href={prevHref} variant="secondary">
          ← Back
        </Button>
      ) : (
        <span />
      )}
      {nextHref && (
        <Button href={nextHref} variant="primary">
          {nextLabel} →
        </Button>
      )}
    </div>
  );
}
