import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders, createQueryClient } from '@/app/providers';
import { ROUTER_FUTURE, routes } from '@/app/routes/AppRoutes';
import { DEMO_ADMIN_PHONE, DEMO_CLEANER_PHONE, DEMO_CUSTOMER_PHONE, DEMO_PASSWORD, DEMO_PENDING_CUSTOMER_PHONE } from '@/mock-data';
import { createMockServices } from '@/services/mock';
import type { DemoPersona } from '@/types';

export const TEST_TODAY = '2026-11-11';

const PHONES: Record<DemoPersona, string> = {
  ADMIN: DEMO_ADMIN_PHONE,
  CLEANER: DEMO_CLEANER_PHONE,
  CUSTOMER_APPROVED: DEMO_CUSTOMER_PHONE,
  CUSTOMER_PENDING: DEMO_PENDING_CUSTOMER_PHONE,
};

/** Renders the full app at `path` against a fresh, deterministic mock backend. */
export async function renderApp(path: string, options: { as?: DemoPersona } = {}) {
  const services = createMockServices({ today: TEST_TODAY, latency: { min: 0, max: 0 }, persist: false });
  if (options.as) await services.auth.login(PHONES[options.as], DEMO_PASSWORD);
  const router = createMemoryRouter(routes, { initialEntries: [path], future: ROUTER_FUTURE });
  const utils = render(
    <AppProviders services={services} queryClient={createQueryClient()}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppProviders>,
  );
  return { ...utils, services, router };
}
