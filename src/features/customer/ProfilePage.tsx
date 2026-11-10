import { ArrowRight, Car } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/feedback';
import { CustomerStatusBadge, SecurePhoto } from '@/components/shared';
import { Card, CardHeader, DescriptionList, PageHeader, SkeletonList } from '@/components/ui';
import { CAR_SIZE_LABEL, SCHEDULE_LABEL, SERVICE_WINDOW_BY_BLOCK } from '@/constants';
import { getErrorMessage } from '@/utils/errors';
import { formatINR, formatPhone } from '@/utils/formatters';
import { useMyAccount } from './useMyAccount';

export function ProfilePage() {
  const { data, isPending, isError, error, refetch } = useMyAccount();
  if (isPending) return <SkeletonList rows={3} />;
  if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />;
  const { customer, vehicles } = data;

  return (
    <div className="space-y-4">
      <PageHeader title="My account" />
      <Card>
        <CardHeader title={customer.name} action={<CustomerStatusBadge status={customer.status} />} />
        <div className="px-4">
          <DescriptionList
            items={[
              { label: 'Mobile', value: formatPhone(customer.phone) },
              { label: 'Flat', value: `Block ${customer.block}, ${customer.flat}` },
              { label: 'Service window', value: SERVICE_WINDOW_BY_BLOCK[customer.block] ?? '—' },
            ]}
          />
        </div>
      </Card>

      {vehicles.map((v) => (
        <Card key={v.id}>
          <CardHeader title={<span className="font-mono font-bold">{v.registration}</span>} description={`${v.makeModel} · ${CAR_SIZE_LABEL[v.carSize]}`} action={<Car className="h-4 w-4 text-navy-400" aria-hidden />} />
          <div className="space-y-3 p-4">
            <SecurePhoto photoId={`car:${v.id}`} alt={`${v.makeModel} ${v.registration}`} className="aspect-[16/9] w-full rounded-lg" />
            <DescriptionList
              items={[
                { label: 'Package', value: v.package?.name ?? 'Not chosen yet' },
                { label: 'Schedule', value: v.package ? SCHEDULE_LABEL[v.package.schedulePattern] : '—' },
                { label: 'Monthly', value: v.package ? formatINR(v.package.monthlyPrice) : '—' },
                { label: 'Parking slot', value: v.parkingSlot },
              ]}
            />
            <Link to={`/customer/packages?v=${v.id}`} className="flex min-h-[44px] items-center justify-between rounded-lg px-3 text-sm font-semibold text-brand ring-1 ring-navy-200 hover:bg-navy-50">
              {v.package ? 'Change package' : 'Choose a package'} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
