import { createContext, useContext, type ReactNode } from 'react';
import type { ServiceRegistry } from '@/services/interfaces';

const ServicesContext = createContext<ServiceRegistry | null>(null);

/** Overrides the active services for a subtree (used by tests and Storybook-style previews). */
export function ServicesProvider({ services, children }: { services: ServiceRegistry; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

/** The single entry point UI code uses to reach data services. */
export function useServices(): ServiceRegistry {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used inside <ServicesProvider>');
  return ctx;
}
