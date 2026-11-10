import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { errorCode } from '@/utils/errors';

/** Errors that will not succeed on retry. */
const NON_RETRYABLE = new Set(['FORBIDDEN', 'UNAUTHENTICATED', 'NOT_FOUND', 'EXPIRED']);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => !NON_RETRYABLE.has(errorCode(error) ?? '') && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

export function QueryProvider({ client, children }: { client?: QueryClient; children: ReactNode }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
