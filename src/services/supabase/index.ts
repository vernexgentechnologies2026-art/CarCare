import type { ServiceRegistry } from '@/services/interfaces';
import type { Backend } from './backend';
import { todayIST } from './backend';
import { SupabaseAdminService } from './SupabaseAdminService';
import { SupabaseAuthService } from './SupabaseAuthService';
import { SupabaseCleanerService } from './SupabaseCleanerService';
import { SupabaseCustomerService } from './SupabaseCustomerService';
import { SupabasePackageService } from './SupabasePackageService';
import { SupabasePaymentService } from './SupabasePaymentService';
import { SupabaseScheduleService } from './SupabaseScheduleService';
import { SupabaseWashService } from './SupabaseWashService';
import { createSupabaseBackend } from './supabaseBackend';
import { getSupabaseClient } from './supabaseClient';

/** Builds the registry on any Backend (production adapter or a test database). */
export function createSupabaseRegistry(backend: Backend, today: () => string = () => todayIST()): ServiceRegistry {
  return {
    dataSource: 'supabase',
    today,
    auth: new SupabaseAuthService(backend),
    customers: new SupabaseCustomerService(backend),
    packages: new SupabasePackageService(backend),
    cleaners: new SupabaseCleanerService(backend),
    washes: new SupabaseWashService(backend),
    schedules: new SupabaseScheduleService(backend),
    payments: new SupabasePaymentService(backend),
    admin: new SupabaseAdminService(backend),
  };
}

/** Live services: Supabase (data, auth), the R2 photo gateway and Razorpay. */
export function createSupabaseServices(): ServiceRegistry {
  const photoGatewayUrl = import.meta.env.VITE_PHOTO_GATEWAY_URL;
  if (!photoGatewayUrl) throw new Error('VITE_DATA_SOURCE=supabase requires VITE_PHOTO_GATEWAY_URL in your local .env file.');
  const backend = createSupabaseBackend(getSupabaseClient(), {
    photoGatewayUrl,
    authEmailDomain: import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'users.carcare.local',
  });
  return createSupabaseRegistry(backend);
}
