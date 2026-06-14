interface ProductThumbProps {
  name: string;
  imageUrl?: string;
  /** Tailwind size classes, e.g. "h-14 w-14". */
  sizeClassName?: string;
  className?: string;
}

/**
 * Product image with a graceful letter-avatar fallback when no image is set.
 * Server-component safe (no event handlers) — relies on valid imageUrls upstream.
 */
export function ProductThumb({
  name,
  imageUrl,
  sizeClassName = 'h-14 w-14',
  className = '',
}: ProductThumbProps) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className={`${sizeClassName} flex-shrink-0 rounded-xl object-cover ring-1 ring-border ${className}`.trim()}
      />
    );
  }
  return (
    <div
      className={`${sizeClassName} grid flex-shrink-0 place-items-center rounded-xl bg-brand/15 text-lg font-semibold text-brand ring-1 ring-brand/20 ${className}`.trim()}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
