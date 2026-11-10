import { useQuery } from '@tanstack/react-query';
import { MAX_PAGE_SIZE } from '@/constants';
import { useServices } from '@/services';
import { qk } from './queryKeys';

/** Cleaner roster for pickers. One page of up to 100 covers the society's 24 cleaners. */
export function useCleaners() {
  const { cleaners } = useServices();
  const query = { page: 1, limit: MAX_PAGE_SIZE };
  return useQuery({ queryKey: qk.cleaners.list(query), queryFn: () => cleaners.list(query), staleTime: 5 * 60_000, select: (p) => p.items });
}
