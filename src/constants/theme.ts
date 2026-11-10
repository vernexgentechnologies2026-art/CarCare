/**
 * Design tokens — single source of truth for Tailwind (`tailwind.config.ts`)
 * and for code that needs raw values (SVG charts, gauges).
 */
export const colors = {
  navy: {
    DEFAULT: '#0F172A',
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  brand: { DEFAULT: '#2563EB', 50: '#EFF6FF', 100: '#DBEAFE', 600: '#2563EB', 700: '#1D4ED8' },
  success: { DEFAULT: '#10B981', 50: '#ECFDF5', 100: '#D1FAE5', 700: '#047857' },
  warning: { DEFAULT: '#F59E0B', 50: '#FFFBEB', 100: '#FEF3C7', 700: '#B45309' },
  danger: { DEFAULT: '#EF4444', 50: '#FEF2F2', 100: '#FEE2E2', 700: '#B91C1C' },
} as const;

export const fontFamily = {
  sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
};

export const shadows = {
  card: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
};
