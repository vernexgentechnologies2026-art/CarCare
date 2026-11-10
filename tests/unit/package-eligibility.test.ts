import { describe, expect, it } from 'vitest';
import type { CarSize } from '@/types';
import { assertPackageEligible, isPackageEligible, packagesForCarSize, supportsCarSize } from '@/utils/packageEligibility';

const pkgs = [
  { id: 'small', carSizes: ['HATCHBACK', 'SEDAN'] as CarSize[], active: true },
  { id: 'suv', carSizes: ['COMPACT_SUV', 'LARGE_SUV'] as CarSize[], active: true },
  { id: 'retired', carSizes: ['HATCHBACK'] as CarSize[], active: false },
  { id: 'all', carSizes: ['HATCHBACK', 'SEDAN', 'COMPACT_SUV', 'LARGE_SUV'] as CarSize[], active: true },
];

describe('car size compatibility', () => {
  it('offers only active packages compatible with the size', () => {
    expect(packagesForCarSize(pkgs, 'HATCHBACK').map((p) => p.id)).toEqual(['small', 'all']);
    expect(packagesForCarSize(pkgs, 'LARGE_SUV').map((p) => p.id)).toEqual(['suv', 'all']);
    expect(packagesForCarSize(pkgs, undefined)).toEqual([]);
  });

  it('checks a single package', () => {
    expect(supportsCarSize(pkgs[0]!, 'SEDAN')).toBe(true);
    expect(isPackageEligible(pkgs[0]!, 'COMPACT_SUV')).toBe(false);
    expect(isPackageEligible(pkgs[2]!, 'HATCHBACK')).toBe(false);
  });

  it('service guard explains why', () => {
    expect(() => assertPackageEligible(pkgs[1]!, 'SEDAN')).toThrow(/not available for your car size/);
    expect(() => assertPackageEligible(pkgs[2]!, 'HATCHBACK')).toThrow(/no longer offered/);
    expect(() => assertPackageEligible(pkgs[3]!, 'LARGE_SUV')).not.toThrow();
  });
});
