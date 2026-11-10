import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField, SelectField } from '@/components/forms';
import { Alert, Button, Modal, Textarea } from '@/components/ui';
import { CAR_SIZE_LABEL } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useCleaners } from '@/hooks/useCleaners';
import { useToast } from '@/hooks/useToast';
import { rejectSchema, type RejectValues } from '@/schemas';
import { useServices } from '@/services';
import type { CustomerSummary } from '@/types';
import { getErrorMessage } from '@/utils/errors';

function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.customers.all }),
      queryClient.invalidateQueries({ queryKey: qk.admin.all }),
      queryClient.invalidateQueries({ queryKey: qk.cleaners.all }),
    ]);
}

export function ApproveDialog({ row, onClose }: { row: CustomerSummary; onClose: () => void }) {
  const services = useServices();
  const toast = useToast();
  const invalidate = useInvalidateCustomers();
  const cleaners = useCleaners();
  const blockCleaners = (cleaners.data ?? []).filter((c) => c.active && c.assignedBlocks.includes(row.customer.block));
  const others = (cleaners.data ?? []).filter((c) => c.active && !c.assignedBlocks.includes(row.customer.block));
  const [cleanerId, setCleanerId] = useState('');
  const selected = cleanerId || blockCleaners[0]?.id || '';

  const mutation = useMutation({
    mutationFn: () => services.customers.approve(row.customer.id, selected),
    onSuccess: async () => {
      await invalidate();
      toast.success('Registration approved', `${row.customer.name} can now choose a package.`);
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      busy={mutation.isPending}
      title="Approve registration"
      description={`${row.customer.name} · Block ${row.customer.block}, ${row.customer.flat}${row.vehicle ? ` · ${row.vehicle.registration} (${CAR_SIZE_LABEL[row.vehicle.carSize]})` : ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="success" loading={mutation.isPending} disabled={!selected} onClick={() => mutation.mutate()}>
            Approve
          </Button>
        </>
      }
    >
      {mutation.isError && <Alert tone="danger" className="mb-3">{getErrorMessage(mutation.error)}</Alert>}
      <SelectField
        label="Assign cleaner"
        hint={`Cleaners covering Block ${row.customer.block} are listed first.`}
        required
        value={selected}
        onChange={(e) => setCleanerId(e.target.value)}
        disabled={cleaners.isPending}
        groups={[
          ...(blockCleaners.length ? [{ label: `Block ${row.customer.block}`, options: blockCleaners.map((c) => ({ value: c.id, label: c.name })) }] : []),
          { label: 'Other blocks', options: others.map((c) => ({ value: c.id, label: `${c.name} (Block ${c.assignedBlocks.join(', ')})` })) },
        ]}
      />
    </Modal>
  );
}

export function RejectDialog({ row, onClose }: { row: CustomerSummary; onClose: () => void }) {
  const services = useServices();
  const toast = useToast();
  const invalidate = useInvalidateCustomers();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RejectValues>({ resolver: zodResolver(rejectSchema), defaultValues: { reason: '' } });
  const mutation = useMutation({
    mutationFn: (v: RejectValues) => services.customers.reject(row.customer.id, v.reason),
    onSuccess: async () => {
      await invalidate();
      toast.info('Registration rejected');
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      busy={mutation.isPending}
      title="Reject registration"
      description="The resident sees this reason on their status screen."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form="reject-form" loading={mutation.isPending}>
            Reject
          </Button>
        </>
      }
    >
      <form id="reject-form" noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
        {mutation.isError && <Alert tone="danger">{getErrorMessage(mutation.error)}</Alert>}
        <FormField label="Reason" error={errors.reason?.message} required>
          {(p) => <Textarea id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} placeholder="e.g. Flat number does not match society records" {...register('reason')} />}
        </FormField>
      </form>
    </Modal>
  );
}
