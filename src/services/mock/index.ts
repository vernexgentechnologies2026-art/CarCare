/**
 * Phase 1 implementation of every service interface: seeded fictional data,
 * simulated latency, localStorage persistence and in-code authorisation.
 */
import type { ServiceRegistry } from '@/services/interfaces';
import type { ISODate } from '@/types';
import { todayISO } from '@/utils/dates';
import { MockAdminService } from './MockAdminService';
import { MockAuthService } from './MockAuthService';
import { MockCleanerService } from './MockCleanerService';
import { MockCustomerService } from './MockCustomerService';
import { MockPackageService } from './MockPackageService';
import { MockPaymentService } from './MockPaymentService';
import { MockScheduleService } from './MockScheduleService';
import { MockWashService } from './MockWashService';
import type { LatencyRange, MockContext } from './runtime';
import { MockStore } from './store';

export interface MockOptions {
  /** Fixed business date, or a clock function (tests). Defaults to the device date. */
  today?: ISODate | (() => ISODate);
  /** Simulated network latency. Defaults to 150–300 ms. */
  latency?: LatencyRange;
  /** Persist to localStorage. Disable in tests. */
  persist?: boolean;
}

export interface MockServiceRegistry extends ServiceRegistry {
  resetDemoData(): Promise<void>;
}

export function createMockServices(options: MockOptions = {}): MockServiceRegistry {
  const clock = options.today;
  const today = (): ISODate => (typeof clock === 'function' ? clock() : (clock ?? todayISO()));
  const store = new MockStore(today, options.persist ?? true);
  const ctx: MockContext = { store, today, latency: options.latency ?? { min: 150, max: 300 } };
  return {
    dataSource: 'mock',
    today,
    auth: new MockAuthService(ctx),
    customers: new MockCustomerService(ctx),
    packages: new MockPackageService(ctx),
    cleaners: new MockCleanerService(ctx),
    washes: new MockWashService(ctx),
    schedules: new MockScheduleService(ctx),
    payments: new MockPaymentService(ctx),
    admin: new MockAdminService(ctx),
    resetDemoData: () => store.reset(),
  };
}

export { MOCK_FAILURE_UPI } from './MockPaymentService';
