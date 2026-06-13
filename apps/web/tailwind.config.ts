import type { Config } from 'tailwindcss';
import { radius } from './src/lib/tokens';

// Wrap an oklch-channel CSS var so Tailwind opacity modifiers (e.g. bg-brand/10) work.
const c = (name: string) => `oklch(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (Lovable design system).
        surface: c('surface'),
        background: c('background'),
        foreground: c('foreground'),
        card: { DEFAULT: c('card'), foreground: c('card-foreground') },
        popover: { DEFAULT: c('popover'), foreground: c('popover-foreground') },
        primary: { DEFAULT: c('primary'), foreground: c('primary-foreground') },
        secondary: { DEFAULT: c('secondary'), foreground: c('secondary-foreground') },
        muted: { DEFAULT: c('muted'), foreground: c('muted-foreground') },
        accent: { DEFAULT: c('accent'), foreground: c('accent-foreground') },
        destructive: { DEFAULT: c('destructive'), foreground: c('destructive-foreground') },
        brand: { DEFAULT: c('brand'), foreground: c('brand-foreground'), strong: c('brand-strong') },
        border: c('border'),
        input: c('input'),
        ring: c('ring'),

        // Legacy aliases — keep pre-existing navy/orange classes resolving to the
        // new palette so every flow page adopts the dark+gold look automatically.
        navy: {
          900: c('surface'),
          800: c('card'),
          700: c('secondary'),
          600: c('border'),
          500: c('border'),
        },
        orange: {
          400: c('brand'),
          500: c('brand'),
          600: c('brand-strong'),
        },
        success: c('brand'),
        warning: c('brand'),
        danger: c('destructive'),
      },
      borderRadius: {
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin-slow 18s linear infinite',
        'spin-reverse': 'spin-slow 24s linear infinite reverse',
        scan: 'scan-line 3.2s cubic-bezier(0.65, 0, 0.35, 1) infinite',
        float: 'float-y 5s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
        glow: 'glow-pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
