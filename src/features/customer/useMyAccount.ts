import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '@/hooks/useAuth';
import { qk } from '@/hooks/queryKeys';
import { useServices } from '@/services';
import type { VehicleDetail } from '@/types';

/** The signed-in resident's profile and vehicles (cleaner identity is never included). */
export function useMyAccount() {
  const session = useSession();
  const { customers } = useServices();
  const customerId = session.customerId ?? '';
  const query = useQuery({ queryKey: qk.customers.detail(customerId), queryFn: () => customers.getById(customerId), enabled: Boolean(customerId) });
  return { customerId, ...query };
}

/** Selected vehicle, kept in the URL (`?v=`) so it survives navigation and refresh. */
export function useSelectedVehicle(vehicles: VehicleDetail[] | undefined) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('v');
  const vehicle = vehicles?.find((v) => v.id === requested) ?? vehicles?.[0] ?? null;
  const select = (id: string) =>
    setParams(
      (p) => {
        p.set('v', id);
        return p;
      },
      { replace: true },
    );
  return { vehicle, select, query: vehicle ? `?v=${vehicle.id}` : '' };
}
