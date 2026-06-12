// ReLoop design tokens — Amazon-native (navy surfaces + orange accents).
// Defined once here, mirrored as CSS variables in globals.css, and consumed by
// tailwind.config.ts. Change a value in one place; the whole app follows.

export const colors = {
  navy: {
    900: '#131A22',
    800: '#232F3E', // primary surface
    700: '#2F3B4C',
    600: '#3A4A5E',
  },
  orange: {
    500: '#FF9900', // primary accent
    600: '#EC7211', // hover / active
  },
  text: {
    primary: '#FFFFFF',
    muted: '#C7D0DA',
  },
  semantic: {
    success: '#2E8B57',
    warning: '#FFB020',
    danger: '#D14343',
  },
} as const;

export const radius = {
  sm: '0.375rem',
  md: '0.625rem',
  lg: '1rem',
} as const;
