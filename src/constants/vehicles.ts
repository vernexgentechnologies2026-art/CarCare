import type { CarSize } from '@/types';

export const CAR_SIZES: readonly CarSize[] = ['HATCHBACK', 'SEDAN', 'COMPACT_SUV', 'LARGE_SUV'];

export const CAR_SIZE_LABEL: Record<CarSize, string> = {
  HATCHBACK: 'Hatchback',
  SEDAN: 'Sedan',
  COMPACT_SUV: 'Compact SUV',
  LARGE_SUV: 'Large SUV',
};

export const CAR_SIZE_HINT: Record<CarSize, string> = {
  HATCHBACK: 'Swift, i20, Tiago',
  SEDAN: 'City, Verna, Dzire',
  COMPACT_SUV: 'Nexon, Brezza, Venue',
  LARGE_SUV: 'Creta, XUV700, Innova',
};

/** Residential blocks in the society. */
export const BLOCKS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Service window per block — when cleaners work that block. Shown to residents
 * as a window, never as an exact cleaning time.
 */
export const SERVICE_WINDOW_BY_BLOCK: Readonly<Record<string, string>> = {
  A: '5:30 – 7:30 AM',
  B: '5:30 – 7:30 AM',
  C: '6:30 – 8:30 AM',
  D: '6:30 – 8:30 AM',
  E: '7:30 – 9:30 AM',
  F: '7:30 – 9:30 AM',
};
