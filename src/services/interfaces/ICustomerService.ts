import type { CustomerDetail, CustomerQuery, CustomerStatus, CustomerSummary, Paginated } from '@/types';

export interface ICustomerService {
  list(query: CustomerQuery): Promise<Paginated<CustomerSummary>>;
  /** Residents may only read their own record; cleaner details are never included for them. */
  getById(customerId: string): Promise<CustomerDetail>;
  /** Approves a pending registration and assigns a cleaner to its vehicle(s). */
  approve(customerId: string, cleanerId: string): Promise<void>;
  reject(customerId: string, reason: string): Promise<void>;
  setStatus(customerId: string, status: Extract<CustomerStatus, 'ACTIVE' | 'PAUSED'>): Promise<void>;
  assignCleaner(vehicleId: string, cleanerId: string): Promise<void>;
  /** Admin change of a vehicle's package. */
  changePackage(vehicleId: string, packageId: string): Promise<void>;
  /** Resident chooses a package for their own (approved) vehicle. */
  selectPackage(vehicleId: string, packageId: string): Promise<void>;
  countByStatus(): Promise<Record<CustomerStatus, number>>;
}
