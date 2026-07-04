import type { Config } from 'tailwindcss';
import { radius } from './src/lib/tokens';

// Wrap an oklch-channel CSS var so Tailwind opacity modifiers (e.g. bg-brand/10) work.
const c = (name: string) => `oklch(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Amazon-native light design system (mirrors newFrontend styles.css).
        surface: c('surface'),
        background: c('background'),
        foreground: c('foreground'),
        hairline: c('hairline'),
        success: c('success'),

        // Semantic shadcn tokens.
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

        // Navy: DEFAULT is the dark ink accent (pills, primary buttons). The 900–500
        // scale keys are legacy aliases from the old dark theme, remapped to light
        // equivalents so any not-yet-reskinned page still renders on the light canvas.
        navy: {
          DEFAULT: c('navy'),
          900: c('surface'),
          800: c('background'),
          700: c('surface'),
          600: c('hairline'),
          500: c('hairline'),
        },
        // Orange: DEFAULT + hover match Amazon Ember; 400–600 keep legacy classes valid.
        orange: {
          DEFAULT: c('orange'),
          hover: c('orange-hover'),
          400: c('orange'),
          500: c('orange'),
          600: c('orange-hover'),
        },
        warning: c('orange'),
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
        'fade-up': 'fade-up 0.6s ease-out both',
        'fade-in': 'fade-in 0.5s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
