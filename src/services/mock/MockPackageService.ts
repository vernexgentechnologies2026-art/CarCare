import { CAR_SIZE_LABEL, SCHEDULE_PATTERNS } from '@/constants';
import { packageSchema, type PackageValues } from '@/schemas';
import type { IPackageService } from '@/services/interfaces';
import type { CarSize, PackageQuery, Paginated, WashPackage } from '@/types';
import { DomainError } from '@/utils/errors';
import { isPackageEligible } from '@/utils/packageEligibility';
import { packageById } from './lookup';
import { audit, paginate, requireSession, respond, type MockContext } from './runtime';

export class MockPackageService implements IPackageService {
  constructor(private readonly ctx: MockContext) {}

  list(query: PackageQuery): Promise<Paginated<WashPackage>> {
    return respond(this.ctx, () => {
      if (query.includeInactive) requireSession(this.ctx, 'ADMIN');
      const rows = this.ctx.store.data.packages
        .filter((p) => (query.includeInactive || p.active) && (!query.carSize || (query.includeInactive ? p.carSizes.includes(query.carSize) : isPackageEligible(p, query.carSize))))
        .sort((a, b) => SCHEDULE_PATTERNS.indexOf(a.schedulePattern) - SCHEDULE_PATTERNS.indexOf(b.schedulePattern) || a.monthlyPrice - b.monthlyPrice);
      return paginate(rows, query);
    });
  }

  create(input: PackageValues): Promise<WashPackage> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const v = packageSchema.parse(input);
      this.assertUniqueName(v.name, null);
      const pkg: WashPackage = { id: this.ctx.store.nextId('pkg'), ...v };
      this.ctx.store.data.packages.push(pkg);
      audit(this.ctx, 'PACKAGE_CREATED', 'PACKAGE', pkg.id, `Created ${pkg.name} at ₹${pkg.monthlyPrice}/month`);
      this.ctx.store.commit();
      return pkg;
    });
  }

  update(packageId: string, input: PackageValues): Promise<WashPackage> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const v = packageSchema.parse(input);
      const pkg = packageById(this.ctx, packageId);
      this.assertUniqueName(v.name, packageId);
      if (pkg.schedulePattern !== v.schedulePattern && this.subscribers(packageId).length > 0) {
        throw new DomainError('PACKAGE_IN_USE', 'The schedule cannot change while vehicles are subscribed. Create a new package instead.');
      }
      for (const size of pkg.carSizes) if (!v.carSizes.includes(size)) this.assertSizeUnused(pkg, size);
      const priceChange = pkg.monthlyPrice !== v.monthlyPrice ? ` (₹${pkg.monthlyPrice} → ₹${v.monthlyPrice})` : '';
      Object.assign(pkg, v);
      audit(this.ctx, 'PACKAGE_UPDATED', 'PACKAGE', pkg.id, `Updated ${pkg.name}${priceChange}`);
      this.ctx.store.commit();
      return pkg;
    });
  }

  setCarSizeCompatibility(packageId: string, carSize: CarSize, enabled: boolean): Promise<WashPackage> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const pkg = packageById(this.ctx, packageId);
      const has = pkg.carSizes.includes(carSize);
      if (enabled === has) return pkg;
      if (!enabled) {
        if (pkg.carSizes.length === 1) throw new DomainError('LAST_SIZE', 'A package needs at least one compatible car size.');
        this.assertSizeUnused(pkg, carSize);
        pkg.carSizes = pkg.carSizes.filter((s) => s !== carSize);
      } else {
        pkg.carSizes = [...pkg.carSizes, carSize];
      }
      audit(this.ctx, 'PACKAGE_UPDATED', 'PACKAGE', pkg.id, `${pkg.name}: ${enabled ? 'now offered' : 'no longer offered'} for ${CAR_SIZE_LABEL[carSize]}`);
      this.ctx.store.commit();
      return pkg;
    });
  }

  private subscribers(packageId: string) {
    return this.ctx.store.data.vehicles.filter((v) => v.packageId === packageId);
  }

  private assertSizeUnused(pkg: WashPackage, size: CarSize): void {
    const count = this.subscribers(pkg.id).filter((v) => v.carSize === size).length;
    if (count > 0) {
      throw new DomainError('SIZE_IN_USE', `${count} ${CAR_SIZE_LABEL[size]} vehicle${count > 1 ? 's are' : ' is'} subscribed to this package. Move them first.`);
    }
  }

  private assertUniqueName(name: string, exceptId: string | null): void {
    const clash = this.ctx.store.data.packages.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new DomainError('DUPLICATE_NAME', 'A package with this name already exists.');
  }
}
