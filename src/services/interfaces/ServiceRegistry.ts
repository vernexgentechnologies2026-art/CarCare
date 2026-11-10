import type { ISODate } from '@/types';
import type { IAdminService } from './IAdminService';
import type { IAuthService } from './IAuthService';
import type { ICleanerService } from './ICleanerService';
import type { ICustomerService } from './ICustomerService';
import type { IPackageService } from './IPackageService';
import type { IPaymentService } from './IPaymentService';
import type { IScheduleService } from './IScheduleService';
import type { IWashService } from './IWashService';

/** Everything the UI can call. Bound to an implementation in `services/index.ts`. */
export interface ServiceRegistry {
  /** Identifies the active backend. Reviewer tooling renders only when 'mock'. */
  readonly dataSource: 'mock' | 'supabase';
  /** Current business date. Injected so tests and demos are deterministic. */
  today(): ISODate;
  auth: IAuthService;
  customers: ICustomerService;
  packages: IPackageService;
  cleaners: ICleanerService;
  washes: IWashService;
  schedules: IScheduleService;
  payments: IPaymentService;
  admin: IAdminService;
  /** Mock-only: wipe local changes (data, photos, session) and re-seed. */
  resetDemoData?: () => Promise<void>;
}
