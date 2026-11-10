import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2 } from 'lucide-react';
import { ErrorState } from '@/components/feedback';
import { Badge, Button, Card, PageHeader, SkeletonList } from '@/components/ui';
import { CAR_SIZE_LABEL, SCHEDULE_LABEL, SCHEDULE_PATTERNS } from '@/constants';
import { usePackages } from '@/features/packages/usePackages';
import { qk } from '@/hooks/queryKeys';
import { useToast } from '@/hooks/useToast';
import { useServices } from '@/services';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';
import { formatINR } from '@/utils/formatters';
import { useMyAccount, useSelectedVehicle } from './useMyAccount';
import { VehicleSwitcher } from './VehicleSwitcher';

/** Package & schedule selection, auto-filtered to the vehicle's car size. Only the 4 contracted schedules exist. */
export function CustomerPackagesPage() {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const account = useMyAccount();
  const { vehicle, select } = useSelectedVehicle(account.data?.vehicles);
  const packages = usePackages({ carSize: vehicle?.carSize });

  const choose = useMutation({
    mutationFn: (packageId: string) => services.customers.selectPackage(vehicle?.id ?? '', packageId),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.customers.all }), queryClient.invalidateQueries({ queryKey: qk.washes.all })]);
      toast.success('Package selected', 'Your wash schedule is updated.');
    },
    onError: (e) => toast.error('Could not select package', getErrorMessage(e)),
  });

  const ordered = [...(packages.data ?? [])].sort((a, b) => SCHEDULE_PATTERNS.indexOf(a.schedulePattern) - SCHEDULE_PATTERNS.indexOf(b.schedulePattern));

  return (
    <div>
      <PageHeader title="Packages & schedule" description={vehicle ? `Showing packages for your ${CAR_SIZE_LABEL[vehicle.carSize].toLowerCase()}.` : undefined} />
      {account.data && <VehicleSwitcher vehicles={account.data.vehicles} selectedId={vehicle?.id} onSelect={select} />}
      {packages.isPending || account.isPending ? (
        <SkeletonList rows={4} />
      ) : packages.isError ? (
        <ErrorState message={getErrorMessage(packages.error)} onRetry={() => void packages.refetch()} />
      ) : (
        <ul className="space-y-3">
          {ordered.map((pkg) => {
            const current = vehicle?.packageId === pkg.id;
            return (
              <li key={pkg.id}>
                <Card className={cn('p-4', current && 'ring-2 ring-brand')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{SCHEDULE_LABEL[pkg.schedulePattern]}</p>
                      <p className="mt-0.5 text-base font-semibold text-navy-900">{pkg.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums text-navy-900">{formatINR(pkg.monthlyPrice)}</p>
                      <p className="text-xs text-navy-500">per month</p>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {pkg.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-navy-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    {current ? (
                      <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>
                        Your current package
                      </Badge>
                    ) : (
                      <Button block size="lg" variant={vehicle?.packageId ? 'secondary' : 'primary'} loading={choose.isPending && choose.variables === pkg.id} disabled={choose.isPending} onClick={() => choose.mutate(pkg.id)}>
                        {vehicle?.packageId ? 'Switch to this package' : 'Choose this package'}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-navy-500">Prices are placeholders for review. Billing changes apply from the next invoice.</p>
    </div>
  );
}
