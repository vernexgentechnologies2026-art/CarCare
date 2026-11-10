import type { PackageValues } from '@/schemas';
import type { CarSize, PackageQuery, Paginated, WashPackage } from '@/types';

export interface IPackageService {
  /** Active packages are public (registration / selection); inactive ones are admin-only. */
  list(query: PackageQuery): Promise<Paginated<WashPackage>>;
  create(input: PackageValues): Promise<WashPackage>;
  update(packageId: string, input: PackageValues): Promise<WashPackage>;
  /** Car-size compatibility toggle. Refuses to drop a size that subscribed vehicles still use. */
  setCarSizeCompatibility(packageId: string, carSize: CarSize, enabled: boolean): Promise<WashPackage>;
}
