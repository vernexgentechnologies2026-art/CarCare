import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/services';
import type { CycleMonth } from '@/types';
import { cycleOf } from '@/utils/dates';
import { progressRatio } from '@/utils/washProgressCalculator';
import { qk } from './queryKeys';

/**
 * Monthly wash progress for one vehicle (13-wash target, completed washes only).
 * Defaults to the current cycle.
 */
export function useWashProgress(vehicleId: string | undefined, cycle?: CycleMonth) {
  const services = useServices();
  const activeCycle = cycle ?? cycleOf(services.today());
  const query = useQuery({
    queryKey: qk.washes.progress(vehicleId ?? '', activeCycle),
    queryFn: () => services.washes.getProgress(vehicleId ?? '', activeCycle),
    enabled: Boolean(vehicleId),
  });
  return { ...query, cycle: activeCycle, ratio: query.data ? progressRatio(query.data) : 0 };
}
