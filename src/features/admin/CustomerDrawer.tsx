import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pause, Play, X } from 'lucide-react';
import { ErrorState } from '@/components/feedback';
import { SelectField } from '@/components/forms';
import { CustomerStatusBadge, InvoiceStatusBadge, SecurePhoto } from '@/components/shared';
import { Alert, Button, DescriptionList, Drawer, SkeletonList } from '@/components/ui';
import { CAR_SIZE_LABEL, SCHEDULE_LABEL, SERVICE_WINDOW_BY_BLOCK } from '@/constants';
import { usePackages } from '@/features/packages/usePackages';
import { qk } from '@/hooks/queryKeys';
import { useCleaners } from '@/hooks/useCleaners';
import { useToast } from '@/hooks/useToast';
import { useServices } from '@/services';
import type { CustomerSummary, VehicleDetail } from '@/types';
import { cycleOf } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatCycle, formatDateTime, formatINR, formatPhone } from '@/utils/formatters';

/** Customer inspection drawer: profile, vehicles (cleaner/package changes), recent invoices. */
export function CustomerDrawer({
  customerId,
  onClose,
  onApprove,
  onReject,
}: {
  customerId: string | null;
  onClose: () => void;
  onApprove: (row: CustomerSummary) => void;
  onReject: (row: CustomerSummary) => void;
}) {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const id = customerId ?? '';
  const detail = useQuery({ queryKey: qk.customers.detail(id), queryFn: () => services.customers.getById(id), enabled: Boolean(customerId) });
  const invQuery = { page: 1, limit: 4 };
  const invoices = useQuery({ queryKey: qk.payments.invoices(id, invQuery), queryFn: () => services.payments.listInvoices({ customerId: id, ...invQuery }), enabled: Boolean(customerId) });

  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'PAUSED') => services.customers.setStatus(id, status),
    onSuccess: async (_, status) => {
      await queryClient.invalidateQueries({ queryKey: qk.customers.all });
      toast.success(status === 'PAUSED' ? 'Service paused' : 'Service resumed');
    },
    onError: (e) => toast.error('Could not update status', getErrorMessage(e)),
  });

  const c = detail.data?.customer;
  const row: CustomerSummary | null = detail.data ? { customer: detail.data.customer, vehicle: detail.data.vehicles[0] ?? null } : null;

  return (
    <Drawer
      open={customerId !== null}
      onClose={onClose}
      title={c?.name ?? 'Customer'}
      description={c ? `Block ${c.block}, Flat ${c.flat} · ${formatPhone(c.phone)}` : undefined}
      footer={
        c && row ? (
          c.status === 'PENDING_APPROVAL' ? (
            <>
              <Button variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => onReject(row)}>
                Reject
              </Button>
              <Button variant="success" icon={<Check className="h-4 w-4" />} onClick={() => onApprove(row)}>
                Approve
              </Button>
            </>
          ) : c.status === 'ACTIVE' ? (
            <Button variant="secondary" icon={<Pause className="h-4 w-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate('PAUSED')}>
              Pause service
            </Button>
          ) : c.status === 'PAUSED' ? (
            <Button icon={<Play className="h-4 w-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate('ACTIVE')}>
              Resume service
            </Button>
          ) : undefined
        ) : undefined
      }
    >
      {detail.isPending ? (
        <SkeletonList rows={3} />
      ) : detail.isError ? (
        <ErrorState message={getErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <CustomerStatusBadge status={detail.data.customer.status} />
            <span className="text-xs text-navy-500">Registered {formatDateTime(detail.data.customer.createdAt)}</span>
          </div>
          {detail.data.customer.rejectionReason && <Alert tone="danger" title="Rejection reason">{detail.data.customer.rejectionReason}</Alert>}
          <DescriptionList items={[{ label: 'Service window', value: SERVICE_WINDOW_BY_BLOCK[detail.data.customer.block] ?? '—' }]} />
          {detail.data.vehicles.map((v) => (
            <VehicleSection key={v.id} vehicle={v} customerId={id} editable={detail.data.customer.status === 'ACTIVE' || detail.data.customer.status === 'PAUSED'} />
          ))}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-navy-900">Recent invoices</h3>
            {invoices.data && invoices.data.items.length > 0 ? (
              <ul className="divide-y divide-navy-100 rounded-lg ring-1 ring-navy-200">
                {invoices.data.items.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      {formatCycle(inv.cycle)} <span className="font-mono text-xs text-navy-500">{inv.number}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatINR(inv.amount)}</span>
                      <InvoiceStatusBadge status={inv.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-navy-500">{invoices.isPending ? 'Loading…' : 'No invoices.'}</p>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function VehicleSection({ vehicle, customerId, editable }: { vehicle: VehicleDetail; customerId: string; editable: boolean }) {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const cleaners = useCleaners();
  const packages = usePackages({ carSize: vehicle.carSize });
  const cycle = cycleOf(services.today());
  const progress = useQuery({ queryKey: qk.washes.progress(vehicle.id, cycle), queryFn: () => services.washes.getProgress(vehicle.id, cycle) });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.customers.detail(customerId) }),
      queryClient.invalidateQueries({ queryKey: qk.customers.all }),
      queryClient.invalidateQueries({ queryKey: qk.washes.all }),
    ]);
  const assign = useMutation({
    mutationFn: (cleanerId: string) => services.customers.assignCleaner(vehicle.id, cleanerId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Cleaner reassigned', vehicle.registration);
    },
    onError: (e) => toast.error('Could not reassign', getErrorMessage(e)),
  });
  const changePkg = useMutation({
    mutationFn: (packageId: string) => services.customers.changePackage(vehicle.id, packageId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Package updated', vehicle.registration);
    },
    onError: (e) => toast.error('Could not change package', getErrorMessage(e)),
  });

  return (
    <section className="rounded-xl ring-1 ring-navy-200">
      <div className="grid gap-3 p-3 sm:grid-cols-[140px_1fr]">
        <SecurePhoto photoId={`car:${vehicle.id}`} alt={vehicle.registration} className="aspect-[16/10] w-full rounded-lg" />
        <div>
          <p className="font-mono text-base font-bold text-navy-900">{vehicle.registration}</p>
          <p className="text-sm text-navy-600">
            {vehicle.makeModel} · {CAR_SIZE_LABEL[vehicle.carSize]}
          </p>
          <p className="mt-1 text-xs text-navy-500">
            Slot {vehicle.parkingSlot}
            {vehicle.package && ` · ${SCHEDULE_LABEL[vehicle.package.schedulePattern]}`}
            {progress.data && ` · ${progress.data.completed}/${progress.data.target} this month`}
          </p>
        </div>
      </div>
      {editable && (
        <div className="grid gap-3 border-t border-navy-100 p-3 sm:grid-cols-2">
          <SelectField
            label="Cleaner"
            value={vehicle.cleaner?.id ?? ''}
            disabled={assign.isPending || cleaners.isPending}
            onChange={(e) => e.target.value && assign.mutate(e.target.value)}
            placeholder={vehicle.cleaner ? undefined : 'Unassigned'}
            options={(cleaners.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · Block ${c.assignedBlocks.join(', ')}` }))}
          />
          <SelectField
            label="Package"
            value={vehicle.packageId ?? ''}
            disabled={changePkg.isPending || packages.isPending}
            onChange={(e) => e.target.value && changePkg.mutate(e.target.value)}
            placeholder={vehicle.packageId ? undefined : 'Not chosen'}
            options={(packages.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${formatINR(p.monthlyPrice)}` }))}
          />
        </div>
      )}
    </section>
  );
}
