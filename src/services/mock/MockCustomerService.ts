import type { ICustomerService } from '@/services/interfaces';
import type { Cleaner, CustomerDetail, CustomerQuery, CustomerStatus, CustomerSummary, Paginated, Vehicle } from '@/types';
import { DomainError } from '@/utils/errors';
import { searchKey } from '@/utils/normalisers';
import { assertPackageEligible } from '@/utils/packageEligibility';
import { customerById, packageById, vehicleById, vehicleDetail } from './lookup';
import { assertCustomerAccess, audit, paginate, requireApprovedCustomer, requireSession, respond, type MockContext } from './runtime';

export class MockCustomerService implements ICustomerService {
  constructor(private readonly ctx: MockContext) {}

  list(query: CustomerQuery): Promise<Paginated<CustomerSummary>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const { customers, vehicles } = this.ctx.store.data;
      const byCustomer = new Map<string, Vehicle[]>();
      for (const v of vehicles) {
        const list = byCustomer.get(v.customerId);
        if (list) list.push(v);
        else byCustomer.set(v.customerId, [v]);
      }
      const term = query.search ? searchKey(query.search.trim()) : '';
      const rows = customers.filter((c) => {
        if (query.status && query.status !== 'ALL' && c.status !== query.status) return false;
        if (query.block && query.block !== 'ALL' && c.block !== query.block) return false;
        const vs = byCustomer.get(c.id) ?? [];
        if (query.cleanerId === 'UNASSIGNED' && !vs.some((v) => !v.cleanerId)) return false;
        if (query.cleanerId && query.cleanerId !== 'ALL' && query.cleanerId !== 'UNASSIGNED' && !vs.some((v) => v.cleanerId === query.cleanerId)) return false;
        return !term || searchKey([c.name, c.phone, `${c.block}${c.flat}`, ...vs.map((v) => v.registration)].join('|')).includes(term);
      });
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = paginate(rows, query);
      return {
        ...page,
        items: page.items.map((customer) => {
          const v = byCustomer.get(customer.id)?.[0];
          return { customer, vehicle: v ? vehicleDetail(this.ctx, v) : null };
        }),
      };
    });
  }

  getById(customerId: string): Promise<CustomerDetail> {
    return respond(this.ctx, () => {
      assertCustomerAccess(this.ctx, customerId);
      const forCustomer = requireSession(this.ctx).role === 'CUSTOMER';
      const customer = customerById(this.ctx, customerId);
      const vehicles = this.ctx.store.data.vehicles.filter((v) => v.customerId === customerId).map((v) => vehicleDetail(this.ctx, v, forCustomer));
      return { customer, vehicles };
    });
  }

  approve(customerId: string, cleanerId: string): Promise<void> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const customer = customerById(this.ctx, customerId);
      if (customer.status !== 'PENDING_APPROVAL') throw new DomainError('INVALID_STATE', 'Only pending registrations can be approved.');
      const cleaner = this.assertCleaner(cleanerId);
      customer.status = 'ACTIVE';
      for (const v of this.ctx.store.data.vehicles) if (v.customerId === customerId) v.cleanerId = cleanerId;
      audit(this.ctx, 'REGISTRATION_APPROVED', 'CUSTOMER', customerId, `Approved ${customer.name} (${customer.block}-${customer.flat}); assigned ${cleaner.name}`);
      this.ctx.store.commit();
    });
  }

  reject(customerId: string, reason: string): Promise<void> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const customer = customerById(this.ctx, customerId);
      if (customer.status !== 'PENDING_APPROVAL') throw new DomainError('INVALID_STATE', 'Only pending registrations can be rejected.');
      customer.status = 'REJECTED';
      customer.rejectionReason = reason.trim();
      audit(this.ctx, 'REGISTRATION_REJECTED', 'CUSTOMER', customerId, `Rejected ${customer.name} (${customer.block}-${customer.flat}): ${customer.rejectionReason}`);
      this.ctx.store.commit();
    });
  }

  setStatus(customerId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const customer = customerById(this.ctx, customerId);
      if (customer.status !== 'ACTIVE' && customer.status !== 'PAUSED') {
        throw new DomainError('INVALID_STATE', 'Only active or paused customers can be changed here.');
      }
      customer.status = status;
      audit(this.ctx, status === 'PAUSED' ? 'CUSTOMER_PAUSED' : 'CUSTOMER_RESUMED', 'CUSTOMER', customerId, `${status === 'PAUSED' ? 'Paused' : 'Resumed'} service for ${customer.name}`);
      this.ctx.store.commit();
    });
  }

  assignCleaner(vehicleId: string, cleanerId: string): Promise<void> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const cleaner = this.assertCleaner(cleanerId);
      const vehicle = vehicleById(this.ctx, vehicleId);
      vehicle.cleanerId = cleanerId;
      audit(this.ctx, 'CLEANER_ASSIGNED', 'VEHICLE', vehicleId, `${vehicle.registration} assigned to ${cleaner.name}`);
      this.ctx.store.commit();
    });
  }

  changePackage(vehicleId: string, packageId: string): Promise<void> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const vehicle = vehicleById(this.ctx, vehicleId);
      const pkg = packageById(this.ctx, packageId);
      assertPackageEligible(pkg, vehicle.carSize);
      vehicle.packageId = packageId;
      audit(this.ctx, 'PACKAGE_CHANGED', 'VEHICLE', vehicleId, `${vehicle.registration} moved to ${pkg.name}`);
      this.ctx.store.commit();
    });
  }

  selectPackage(vehicleId: string, packageId: string): Promise<void> {
    return respond(this.ctx, () => {
      const session = requireApprovedCustomer(this.ctx);
      const vehicle = vehicleById(this.ctx, vehicleId);
      if (vehicle.customerId !== session.customerId) throw new DomainError('FORBIDDEN', 'You do not have access to this vehicle.');
      const pkg = packageById(this.ctx, packageId);
      assertPackageEligible(pkg, vehicle.carSize);
      if (vehicle.packageId === packageId) return;
      vehicle.packageId = packageId;
      audit(this.ctx, 'PACKAGE_SELECTED', 'VEHICLE', vehicleId, `${vehicle.registration} selected ${pkg.name}`);
      this.ctx.store.commit();
    });
  }

  countByStatus(): Promise<Record<CustomerStatus, number>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const counts: Record<CustomerStatus, number> = { PENDING_APPROVAL: 0, ACTIVE: 0, REJECTED: 0, PAUSED: 0 };
      for (const c of this.ctx.store.data.customers) counts[c.status] += 1;
      return counts;
    });
  }

  private assertCleaner(cleanerId: string): Cleaner {
    const cleaner = this.ctx.store.data.cleaners.find((c) => c.id === cleanerId);
    if (!cleaner?.active) throw new DomainError('INVALID_CLEANER', 'Select an active cleaner.');
    return cleaner;
  }
}
