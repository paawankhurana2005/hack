import type { SVGProps } from 'react';

/**
 * Lightweight inline icon set for the user-side Return flow.
 * Stroke-based, 1.5px, currentColor — matches the landing/seller line-icon
 * style and keeps the bundle dependency-free (no icon library in this repo).
 */

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 4h-5L8 6H4.5A1.5 1.5 0 0 0 3 7.5v10A1.5 1.5 0 0 0 4.5 19h15a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 19.5 6H16l-1.5-2Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </Base>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 6.5h10.5v8.5H3z" />
      <path d="M13.5 9.5H17l3 3v2.5h-6.5z" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="16.5" cy="17" r="1.6" />
    </Base>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 14.5h3" />
    </Base>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M19 5c0 7-4 12-11 12-2 0-4-1-4-1s2-12 15-11Z" />
      <path d="M9 16c2-4 5-6 8-7" />
    </Base>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8" />
      <path d="M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8" />
      <path d="M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16" />
      <path d="M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" />
      <path d="M4 12h16" />
    </Base>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21s-6.5-5.3-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.7 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </Base>
  );
}

export function ClipboardCheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 13.5l2 2 4-4" />
    </Base>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M4 7l8 4 8-4" />
      <path d="M12 11v10" />
    </Base>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Base>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Base>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 6l6 6-6 6" />
    </Base>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3l7 2.5V11c0 4.5-3 8-7 9-4-1-7-4.5-7-9V5.5L12 3Z" />
      <path d="M9 12l2 2 4-4" />
    </Base>
  );
}
