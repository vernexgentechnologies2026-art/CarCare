import type { Config } from 'tailwindcss';
import { colors, fontFamily, shadows } from './src/constants/theme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily,
      boxShadow: shadows,
    },
  },
  plugins: [],
} satisfies Config;
