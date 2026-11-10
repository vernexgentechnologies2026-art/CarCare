import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { EmptyState } from '@/components/feedback';
import { FormField, SelectField } from '@/components/forms';
import { RescheduleStatusBadge } from '@/components/shared';
import { Alert, Button, Card, CardHeader, Input, PageHeader, SkeletonList, Textarea } from '@/components/ui';
import { RESCHEDULE_WINDOW_DAYS } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useToast } from '@/hooks/useToast';
import { rescheduleSchema, type RescheduleValues } from '@/schemas';
import { useServices } from '@/services';
import { addDays } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatDate, formatDateShort } from '@/utils/formatters';
import { validateReschedule } from '@/utils/scheduleRules';
import { useMyAccount, useSelectedVehicle } from './useMyAccount';
import { VehicleSwitcher } from './VehicleSwitcher';

/**
 * Request a makeup wash for a missed (vehicle-not-present) date. Rule 8: the
 * request — even once approved — does not change progress; only the executed,
 * photo-verified makeup wash counts.
 */
export function ReschedulePage() {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = services.today();
  const account = useMyAccount();
  const { vehicle, select } = useSelectedVehicle(account.data?.vehicles);
  const vehicleId = vehicle?.id ?? '';

  const misses = useQuery({ queryKey: qk.washes.misses(vehicleId), queryFn: () => services.washes.getReschedulableMisses(vehicleId, { page: 1, limit: 20 }), enabled: Boolean(vehicleId) });
  const logQuery = { customerId: account.customerId, vehicleId, page: 1, limit: 20 };
  const log = useQuery({ queryKey: qk.schedules.mine(account.customerId, vehicleId), queryFn: () => services.schedules.listReschedulesForCustomer(logQuery), enabled: Boolean(vehicleId) });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<RescheduleValues>({ resolver: zodResolver(rescheduleSchema), defaultValues: { missedDate: '', requestedDate: addDays(today, 1), reason: '' } });

  const mutation = useMutation({
    mutationFn: (v: RescheduleValues) => services.schedules.createReschedule(vehicleId, v),
    onSuccess: async () => {
      reset({ missedDate: '', requestedDate: addDays(today, 1), reason: '' });
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.schedules.all }), queryClient.invalidateQueries({ queryKey: qk.washes.misses(vehicleId) })]);
      toast.success('Request sent', 'The facility office will confirm your new date.');
    },
  });

  const onSubmit = handleSubmit((v) => {
    const problem = validateReschedule(v.missedDate, v.requestedDate, today);
    if (problem) return setError('requestedDate', { message: problem });
    mutation.mutate(v);
  });

  const dates = misses.data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Reschedule a missed wash" description="If your car wasn’t in its slot, ask for a makeup wash on another day." />
      {account.data && <VehicleSwitcher vehicles={account.data.vehicles} selectedId={vehicle?.id} onSelect={select} />}

      <Card className="p-4">
        {misses.isPending ? (
          <SkeletonList rows={2} />
        ) : dates.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="No missed washes to reschedule" description="Missed washes from the last 30 days appear here." />
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {mutation.isError && <Alert tone="danger">{getErrorMessage(mutation.error)}</Alert>}
            <SelectField label="Missed wash" required placeholder="Select a date" error={errors.missedDate?.message} options={dates.map((d) => ({ value: d, label: formatDateShort(d) }))} {...register('missedDate')} />
            <FormField label="Makeup wash date" required error={errors.requestedDate?.message} hint={`Any day up to ${formatDate(addDays(today, RESCHEDULE_WINDOW_DAYS))}.`}>
              {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} type="date" min={addDays(today, 1)} max={addDays(today, RESCHEDULE_WINDOW_DAYS)} {...register('requestedDate')} />}
            </FormField>
            <FormField label="Reason" required error={errors.reason?.message}>
              {(p) => <Textarea id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} placeholder="e.g. I was travelling" {...register('reason')} />}
            </FormField>
            <p className="text-xs text-navy-500">Rescheduling doesn’t change your wash count — the makeup wash counts once it’s done and photographed.</p>
            <Button type="submit" block size="lg" loading={mutation.isPending}>
              Send request
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <CardHeader title="Your requests" />
        {log.isPending ? (
          <div className="p-4">
            <SkeletonList rows={2} />
          </div>
        ) : !log.data || log.data.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-navy-500">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-navy-100">
            {log.data.items.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-navy-900">
                    <span className="text-navy-500">Missed</span> {formatDateShort(r.missedDate)} <span className="text-navy-400">→</span> <span className="font-semibold">{formatDateShort(r.requestedDate)}</span>
                  </p>
                  <RescheduleStatusBadge status={r.status} />
                </div>
                {r.adminNote && <p className="mt-1 text-xs text-navy-500">Office note: {r.adminNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
