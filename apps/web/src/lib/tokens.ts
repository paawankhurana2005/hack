// ReLoop design tokens — dark "second-life" surface + gold brand accent.
// Values are oklch *channels* (lightness chroma hue) WITHOUT the oklch() wrapper,
// so Tailwind can inject alpha via `oklch(var(--x) / <alpha-value>)` and support
// opacity modifiers like `bg-brand/10`. Mirrored as CSS variables in globals.css
// and consumed by tailwind.config.ts. Change a value here → mirror it there.

export const oklch = {
  surface: '0.16 0.005 285', // page background (near-black)
  background: '0.16 0.005 285',
  foreground: '0.985 0 0', // primary text (near-white)
  card: '0.21 0.006 285', // raised surfaces
  cardForeground: '0.985 0 0',
  popover: '0.21 0.006 285',
  popoverForeground: '0.985 0 0',
  primary: '0.985 0 0',
  primaryForeground: '0.16 0.005 285',
  secondary: '0.27 0.006 285',
  secondaryForeground: '0.985 0 0',
  muted: '0.27 0.006 285',
  mutedForeground: '0.705 0.01 285',
  accent: '0.27 0.006 285',
  accentForeground: '0.985 0 0',
  destructive: '0.62 0.22 25',
  destructiveForeground: '0.985 0 0',
  border: '0.3 0.006 285',
  input: '0.3 0.006 285',
  ring: '0.85 0.17 88',
  brand: '0.82 0.17 88', // gold accent
  brandForeground: '0.16 0.005 285',
  brandStrong: '0.78 0.17 88', // hover / active gold
} as const;

export const radius = {
  sm: '0.5rem',
  md: '0.625rem',
  lg: '0.75rem',
  xl: '1rem',
} as const;
