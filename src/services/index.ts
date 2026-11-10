/**
 * Service factory — the composition root for data access, and the ONLY module
 * that knows which implementation backs the interfaces: VITE_DATA_SOURCE=mock
 * (default) or supabase. Screens never import either implementation.
 */
import type { ServiceRegistry } from '@/services/interfaces';
import { createMockServices } from './mock';
import { createSupabaseServices } from './supabase';

export type * from './interfaces';
export { ServicesProvider, useServices } from './ServicesContext';

export function createServices(): ServiceRegistry {
  const source = import.meta.env.VITE_DATA_SOURCE ?? 'mock';
  switch (source) {
    case 'mock':
      return createMockServices();
    case 'supabase':
      return createSupabaseServices();
    default:
      throw new Error(`Unknown data source "${source}".`);
  }
}

let active: ServiceRegistry | null = null;

/** The app-wide service singletons, created on first use. */
export function getServices(): ServiceRegistry {
  active ??= createServices();
  return active;
}
