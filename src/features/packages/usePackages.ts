import { useQuery } from '@tanstack/react-query';
import { MAX_PAGE_SIZE } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useServices } from '@/services';
import type { CarSize, PackageQuery } from '@/types';

/** Packages on offer (optionally only those compatible with `carSize`); admins may include retired ones. */
export function usePackages(options: { includeInactive?: boolean; carSize?: CarSize } = {}) {
  const { packages } = useServices();
  const query: PackageQuery = { page: 1, limit: MAX_PAGE_SIZE, ...options };
  return useQuery({ queryKey: qk.packages(query), queryFn: () => packages.list(query), select: (p) => p.items });
}
