import type { CarSize, WashPackage } from '@/types';
import { DomainError } from './errors';

type Eligible = Pick<WashPackage, 'active' | 'carSizes'>;

/** True when the package lists this car size among its compatible sizes. */
export function supportsCarSize(pkg: Pick<WashPackage, 'carSizes'>, carSize: CarSize): boolean {
  return pkg.carSizes.includes(carSize);
}

/** A package is offered to a vehicle only when it is active and compatible with its size. */
export function isPackageEligible(pkg: Eligible, carSize: CarSize): boolean {
  return pkg.active && supportsCarSize(pkg, carSize);
}

export function packagesForCarSize<T extends Eligible>(packages: readonly T[], carSize: CarSize | undefined): T[] {
  return carSize ? packages.filter((p) => isPackageEligible(p, carSize)) : [];
}

export function assertPackageEligible(pkg: Eligible, carSize: CarSize): void {
  if (!pkg.active) throw new DomainError('PACKAGE_INACTIVE', 'This package is no longer offered.');
  if (!supportsCarSize(pkg, carSize)) throw new DomainError('PACKAGE_MISMATCH', 'This package is not available for your car size.');
}
