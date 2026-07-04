// ReLoop design tokens — Amazon-native LIGHT surface + orange brand accent.
// Values are oklch *channels* (lightness chroma hue) WITHOUT the oklch() wrapper,
// so Tailwind can inject alpha via `oklch(var(--x) / <alpha-value>)` and support
// opacity modifiers like `bg-brand/10`. Mirrored as CSS variables in globals.css
// and consumed by tailwind.config.ts. Change a value here → mirror it there.

export const oklch = {
  surface: '0.97 0.002 247', // #F3F3F3 app canvas
  background: '1 0 0', // white page
  foreground: '0.27 0.03 252', // #232F3E Squid Ink navy — primary text
  navy: '0.27 0.03 252', // dark navy accent (pills, primary buttons)
  orange: '0.78 0.17 65', // #FF9900 Amazon Ember
  orangeHover: '0.72 0.17 60', // #EC7211 hover / active
  hairline: '0.92 0.004 247', // #E5E7EB borders
  success: '0.6 0.15 152', // green — good states
  card: '1 0 0', // white raised surfaces
  cardForeground: '0.27 0.03 252',
  popover: '1 0 0',
  popoverForeground: '0.27 0.03 252',
  primary: '0.78 0.17 65', // orange primary
  primaryForeground: '1 0 0',
  secondary: '0.97 0.002 247',
  secondaryForeground: '0.27 0.03 252',
  muted: '0.97 0.002 247',
  mutedForeground: '0.5 0.02 252',
  accent: '0.97 0.002 247',
  accentForeground: '0.27 0.03 252',
  destructive: '0.577 0.245 27.325',
  destructiveForeground: '0.985 0.003 247',
  border: '0.92 0.004 247',
  input: '0.92 0.004 247',
  ring: '0.78 0.17 65',
  brand: '0.78 0.17 65', // orange accent
  brandForeground: '1 0 0',
  brandStrong: '0.72 0.17 60', // hover / active orange
} as const;

export const radius = {
  sm: '0.5rem',
  md: '0.625rem',
  lg: '0.75rem',
  xl: '1rem',
} as const;
