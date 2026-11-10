/**
 * Service contracts. The UI depends ONLY on these (via `useServices()`).
 * Phase 1 binds them to `services/mock`; Phase 5 binds them to Supabase / R2 /
 * Razorpay implementations without changing UI code.
 *
 * Authorisation: implementations derive the acting user from the session.
 * Phase 5 enforces this with RLS; the mock enforces it in code.
 */
export type { IAdminService } from './IAdminService';
export type { IAuthService } from './IAuthService';
export type { ICleanerService } from './ICleanerService';
export type { ICustomerService } from './ICustomerService';
export type { IPackageService } from './IPackageService';
export type { IPaymentService } from './IPaymentService';
export type { IScheduleService } from './IScheduleService';
export type { IWashService } from './IWashService';
export type { ServiceRegistry } from './ServiceRegistry';
