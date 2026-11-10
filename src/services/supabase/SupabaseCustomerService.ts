import type { ICustomerService } from '@/services/interfaces';
import type { CustomerDetail, CustomerQuery, CustomerStatus, CustomerSummary, Paginated } from '@/types';
import { DomainError } from '@/utils/errors';
import { filterArg, pageArgs, toPaginated, type Backend } from './backend';

export class SupabaseCustomerService implements ICustomerService {
  constructor(private readonly backend: Backend) {}

  async list(query: CustomerQuery): Promise<Paginated<CustomerSummary>> {
    const result = await this.backend.rpc<{ items: CustomerSummary[]; total: number }>('admin_list_customers', {
      p_search: query.search?.trim() || null,
      p_status: filterArg(query.status),
      p_block: filterArg(query.block),
      p_cleaner: filterArg(query.cleanerId),
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }

  /** The database omits cleaner details when a resident reads their own record (rule 7). */
  getById(customerId: string): Promise<CustomerDetail> {
    return this.backend.rpc<CustomerDetail>('get_customer_detail', { p_customer_id: customerId });
  }

  async approve(customerId: string, cleanerId: string): Promise<void> {
    await this.backend.rpc('approve_customer', { p_customer_id: customerId, p_cleaner_id: cleanerId });
  }

  async reject(customerId: string, reason: string): Promise<void> {
    if (reason.trim().length < 3) throw new DomainError('INVALID', 'Give a reason for the rejection.');
    await this.backend.rpc('reject_customer', { p_customer_id: customerId, p_reason: reason.trim() });
  }

  async setStatus(customerId: string, status: Extract<CustomerStatus, 'ACTIVE' | 'PAUSED'>): Promise<void> {
    await this.backend.rpc('set_customer_status', { p_customer_id: customerId, p_status: status });
  }

  async assignCleaner(vehicleId: string, cleanerId: string): Promise<void> {
    await this.backend.rpc('assign_cleaner', { p_vehicle_id: vehicleId, p_cleaner_id: cleanerId });
  }

  async changePackage(vehicleId: string, packageId: string): Promise<void> {
    await this.backend.rpc('admin_change_package', { p_vehicle_id: vehicleId, p_package_id: packageId });
  }

  async selectPackage(vehicleId: string, packageId: string): Promise<void> {
    await this.backend.rpc('select_package', { p_vehicle_id: vehicleId, p_package_id: packageId, p_starts_on: null });
  }

  countByStatus(): Promise<Record<CustomerStatus, number>> {
    return this.backend.rpc<Record<CustomerStatus, number>>('count_customers_by_status');
  }
}
