import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/feedback';
import { getServices, ServicesProvider, type ServiceRegistry } from '@/services';
import { AuthProvider } from './AuthProvider';
import { QueryProvider } from './QueryProvider';
import { ToastProvider } from './ToastProvider';

/**
 * App-wide providers, outermost first. `services` and `queryClient` are
 * injectable so tests run against an isolated, deterministic backend.
 */
export function AppProviders({ services, queryClient, children }: { services?: ServiceRegistry; queryClient?: QueryClient; children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ServicesProvider services={services ?? getServices()}>
        <QueryProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </QueryProvider>
      </ServicesProvider>
    </ErrorBoundary>
  );
}
