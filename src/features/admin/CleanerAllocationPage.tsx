import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { ErrorState } from '@/components/feedback';
import { SelectField } from '@/components/forms';
import { Alert, Button, Card, CardHeader, Meter, Modal, PageHeader, SkeletonList } from '@/components/ui';
import { BLOCKS, MAX_PAGE_SIZE } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useToast } from '@/hooks/useToast';
import { reassignSchema, type ReassignValues } from '@/schemas';
import { useServices } from '@/services';
import type { CleanerWorkload } from '@/types';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';
import { formatDate, formatPhone } from '@/utils/formatters';

/** Cleaner roster, daily assigned counts, block route coverage and bulk reassignment. */
export function CleanerAllocationPage() {
  const services = useServices();
  const today = services.today();
  const [reassignFrom, setReassignFrom] = useState<CleanerWorkload | null | undefined>(undefined);
  const query = { page: 1, limit: MAX_PAGE_SIZE };
  const workload = useQuery({ queryKey: qk.cleaners.workload(today, query), queryFn: () => services.cleaners.getWorkload(today, query) });
  const rows = workload.data?.items ?? [];
  const maxCell = Math.max(1, ...rows.flatMap((r) => Object.values(r.vehiclesByBlock)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cleaner allocation"
        description={`Routes and today’s progress · ${formatDate(today)}`}
        actions={
          <Button icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => setReassignFrom(null)}>
            Reassign cleaner
          </Button>
        }
      />
      {workload.isPending ? (
        <SkeletonList rows={6} />
      ) : workload.isError ? (
        <ErrorState message={getErrorMessage(workload.error)} onRetry={() => void workload.refetch()} />
      ) : (
        <>
          <Card>
            <CardHeader title="Roster" description="Daily assigned vehicles and progress" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">Cleaner roster</caption>
                <thead>
                  <tr className="border-b border-navy-100 bg-navy-50/70 text-left text-xs font-medium uppercase tracking-wide text-navy-500">
                    <th scope="col" className="px-4 py-2.5">Cleaner</th>
                    <th scope="col" className="px-4 py-2.5">Route</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Vehicles</th>
                    <th scope="col" className="min-w-[200px] px-4 py-2.5">Today</th>
                    <th scope="col" className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {rows.map((w) => (
                    <tr key={w.cleaner.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-navy-900">{w.cleaner.name}</p>
                        <p className="text-xs text-navy-500">{formatPhone(w.cleaner.phone)}</p>
                      </td>
                      <td className="px-4 py-3 text-navy-700">Block {w.cleaner.assignedBlocks.join(', ')}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <Link to={`/admin/customers?cleaner=${w.cleaner.id}`} className="text-brand hover:underline">
                          {w.assignedVehicles}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-between text-xs tabular-nums text-navy-600">
                          <span>
                            {w.completedToday} done · {w.notPresentToday} VNP
                          </span>
                          <span>{w.jobsToday} jobs</span>
                        </div>
                        <div className="mt-1">
                          <Meter value={w.completedToday + w.notPresentToday} max={w.jobsToday} label={`${w.cleaner.name} progress`} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setReassignFrom(w)}>
                          Reassign
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Block route coverage" description="Active vehicles per cleaner per block" />
            <div className="overflow-x-auto p-4">
              <table className="min-w-full text-sm">
                <caption className="sr-only">Vehicles per cleaner per block</caption>
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-navy-500">
                    <th scope="col" className="py-2 pr-3 text-left">Cleaner</th>
                    {BLOCKS.map((b) => (
                      <th key={b} scope="col" className="px-1 py-2 text-center">
                        {b}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.cleaner.id}>
                      <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left text-sm font-medium text-navy-800">
                        {w.cleaner.name}
                      </th>
                      {BLOCKS.map((b) => {
                        const n = w.vehiclesByBlock[b] ?? 0;
                        const strength = n / maxCell;
                        return (
                          <td key={b} className="px-1 py-1">
                            <span
                              className={cn('flex h-9 min-w-[44px] items-center justify-center rounded-md text-xs font-semibold tabular-nums', n === 0 ? 'bg-navy-50 text-navy-300' : strength > 0.6 ? 'bg-brand text-white' : strength > 0.3 ? 'bg-brand-100 text-brand-700' : 'bg-brand-50 text-brand-700')}
                              title={`${w.cleaner.name}: ${n} vehicles in Block ${b}`}
                            >
                              {n || '·'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      {reassignFrom !== undefined && <ReassignDialog from={reassignFrom} roster={rows} onClose={() => setReassignFrom(undefined)} />}
    </div>
  );
}

function ReassignDialog({ from, roster, onClose }: { from: CleanerWorkload | null; roster: CleanerWorkload[]; onClose: () => void }) {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ReassignValues>({ resolver: zodResolver(reassignSchema), defaultValues: { fromCleanerId: from?.cleaner.id ?? '', toCleanerId: '', block: 'ALL' } });
  const fromId = useWatch({ control, name: 'fromCleanerId' });
  const source = roster.find((r) => r.cleaner.id === fromId);
  const blocks = source ? Object.entries(source.vehiclesByBlock).filter(([, n]) => n > 0) : [];

  const mutation = useMutation({
    mutationFn: (v: ReassignValues) => services.cleaners.reassign(v),
    onSuccess: async ({ moved }) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.cleaners.all }), queryClient.invalidateQueries({ queryKey: qk.customers.all }), queryClient.invalidateQueries({ queryKey: qk.washes.all })]);
      toast.success('Route reassigned', `${moved} vehicle${moved > 1 ? 's' : ''} moved.`);
      onClose();
    },
  });

  const cleanerOptions = roster.map((r) => ({ value: r.cleaner.id, label: `${r.cleaner.name} · Block ${r.cleaner.assignedBlocks.join(', ')} · ${r.assignedVehicles} vehicles` }));

  return (
    <Modal
      open
      onClose={onClose}
      busy={mutation.isPending}
      title="Reassign cleaner"
      description="Move a cleaner’s vehicles — the whole route or one block — to another cleaner."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="reassign-form" loading={mutation.isPending}>
            Reassign
          </Button>
        </>
      }
    >
      <form id="reassign-form" noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        {mutation.isError && <Alert tone="danger">{getErrorMessage(mutation.error)}</Alert>}
        <SelectField label="From cleaner" required placeholder="Select" error={errors.fromCleanerId?.message} options={cleanerOptions} {...register('fromCleanerId')} />
        <SelectField
          label="Vehicles to move"
          required
          options={[{ value: 'ALL', label: `Whole route${source ? ` (${source.assignedVehicles})` : ''}` }, ...blocks.map(([b, n]) => ({ value: b, label: `Block ${b} only (${n})` }))]}
          {...register('block')}
        />
        <SelectField label="To cleaner" required placeholder="Select" error={errors.toCleanerId?.message} options={cleanerOptions.filter((o) => o.value !== fromId)} {...register('toCleanerId')} />
        <p className="text-xs text-navy-500">Applies from the next job. Recorded washes keep their original cleaner for the audit trail.</p>
      </form>
    </Modal>
  );
}
