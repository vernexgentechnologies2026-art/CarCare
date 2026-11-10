import type { IPackageService } from '@/services/interfaces';
import { packageSchema, type PackageValues } from '@/schemas';
import type { CarSize, PackageQuery, Paginated, WashPackage } from '@/types';
import { pageArgs, toPaginated, type Backend } from './backend';
import { carSizeCodec } from './mappers';

export class SupabasePackageService implements IPackageService {
  constructor(private readonly backend: Backend) {}

  /** Inactive packages are returned only to admins (enforced in the database). */
  async list(query: PackageQuery): Promise<Paginated<WashPackage>> {
    const result = await this.backend.rpc<{ items: WashPackage[]; total: number }>('list_packages', {
      p_include_inactive: query.includeInactive ?? false,
      p_car_size: query.carSize ? carSizeCodec.toDb(query.carSize) : null,
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }

  create(input: PackageValues): Promise<WashPackage> {
    return this.save(null, input);
  }

  update(packageId: string, input: PackageValues): Promise<WashPackage> {
    return this.save(packageId, input);
  }

  setCarSizeCompatibility(packageId: string, carSize: CarSize, enabled: boolean): Promise<WashPackage> {
    return this.backend.rpc<WashPackage>('set_package_car_size', { p_package_id: packageId, p_car_size: carSize, p_enabled: enabled });
  }

  private save(id: string | null, input: PackageValues): Promise<WashPackage> {
    const v = packageSchema.parse(input);
    return this.backend.rpc<WashPackage>('save_package', {
      p_id: id,
      p_name: v.name,
      p_car_sizes: v.carSizes,
      p_schedule_pattern: v.schedulePattern,
      p_monthly_price: v.monthlyPrice,
      p_description: v.description,
      p_features: v.features,
      p_active: v.active,
    });
  }
}
