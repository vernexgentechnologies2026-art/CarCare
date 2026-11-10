import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/feedback';
import { Badge, Button, Card, PageHeader, SkeletonList } from '@/components/ui';
import { CAR_SIZE_LABEL, CAR_SIZES, SCHEDULE_LABEL } from '@/constants';
import { PackageFormDialog } from '@/features/packages/PackageFormDialog';
import { usePackages } from '@/features/packages/usePackages';
import { qk } from '@/hooks/queryKeys';
import { useToast } from '@/hooks/useToast';
import { useServices } from '@/services';
import type { CarSize, WashPackage } from '@/types';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';
import { formatINR } from '@/utils/formatters';

/** Grid of packages with car-size compatibility toggles and an edit modal. */
export function PackagesPage() {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const packages = usePackages({ includeInactive: true });
  const [editing, setEditing] = useState<WashPackage | 'new' | null>(null);

  const toggle = useMutation({
    mutationFn: (v: { pkg: WashPackage; size: CarSize; enabled: boolean }) => services.packages.setCarSizeCompatibility(v.pkg.id, v.size, v.enabled),
    onSuccess: async (_, v) => {
      await queryClient.invalidateQueries({ queryKey: qk.packagesAll });
      toast.success(`${CAR_SIZE_LABEL[v.size]} ${v.enabled ? 'enabled' : 'disabled'}`, v.pkg.name);
    },
    onError: (e) => toast.error('Could not change compatibility', getErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Packages & pricing"
        description="Toggle which car sizes each package is offered to. Residents only see compatible packages."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New package
          </Button>
        }
      />
      {packages.isPending ? (
        <SkeletonList rows={4} />
      ) : packages.isError ? (
        <ErrorState message={getErrorMessage(packages.error)} onRetry={() => void packages.refetch()} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {packages.data.map((pkg) => (
            <li key={pkg.id}>
              <Card className={cn('flex h-full flex-col p-4', !pkg.active && 'opacity-70')}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{SCHEDULE_LABEL[pkg.schedulePattern]}</p>
                  {pkg.active ? <Badge tone="success">Active</Badge> : <Badge>Retired</Badge>}
                </div>
                <p className="mt-1 font-semibold text-navy-900">{pkg.name}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-navy-900">
                  {formatINR(pkg.monthlyPrice)}
                  <span className="text-sm font-normal text-navy-500"> /month</span>
                </p>
                <ul className="mt-2 flex-1 space-y-0.5 text-xs text-navy-600">
                  {pkg.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                <fieldset className="mt-3">
                  <legend className="mb-1.5 text-xs font-medium text-navy-500">Car size compatibility</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {CAR_SIZES.map((size) => {
                      const on = pkg.carSizes.includes(size);
                      return (
                        <button
                          key={size}
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${CAR_SIZE_LABEL[size]} for ${pkg.name}`}
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate({ pkg, size, enabled: !on })}
                          className={cn('min-h-[32px] rounded-full px-2.5 text-xs font-medium ring-1 ring-inset disabled:opacity-60', on ? 'bg-brand text-white ring-brand' : 'bg-white text-navy-600 ring-navy-200 hover:bg-navy-50')}
                        >
                          {CAR_SIZE_LABEL[size]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <Button className="mt-4" variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(pkg)}>
                  Edit package
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-navy-500">Prices are fictional placeholders for review and will be replaced with the facility’s confirmed rates.</p>
      {editing && <PackageFormDialog pkg={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
