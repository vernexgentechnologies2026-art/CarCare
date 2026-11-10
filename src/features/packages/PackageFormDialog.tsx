import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { FormField, SelectField } from '@/components/forms';
import { Alert, Button, Input, Modal, Textarea } from '@/components/ui';
import { CAR_SIZE_LABEL, CAR_SIZES, SCHEDULE_LABEL, SCHEDULE_PATTERNS } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useToast } from '@/hooks/useToast';
import { packageSchema, type PackageInput, type PackageValues } from '@/schemas';
import { useServices } from '@/services';
import type { CarSize, WashPackage } from '@/types';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';

/** Create or edit a package: name, schedule (4 contracted only), compatible sizes, price, features. */
export function PackageFormDialog({ pkg, onClose }: { pkg: WashPackage | null; onClose: () => void }) {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<PackageInput, unknown, PackageValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: pkg
      ? { name: pkg.name, carSizes: pkg.carSizes, schedulePattern: pkg.schedulePattern, monthlyPrice: pkg.monthlyPrice, description: pkg.description, features: pkg.features, active: pkg.active }
      : { name: '', carSizes: ['HATCHBACK', 'SEDAN'], schedulePattern: 'MON_WED_FRI', monthlyPrice: 0, description: '', features: ['After-wash photo every visit'], active: true },
  });

  const mutation = useMutation({
    mutationFn: (v: PackageValues) => (pkg ? services.packages.update(pkg.id, v) : services.packages.create(v)),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.packagesAll }), queryClient.invalidateQueries({ queryKey: qk.customers.all })]);
      toast.success(pkg ? 'Package updated' : 'Package created');
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      busy={mutation.isPending}
      title={pkg ? 'Edit package' : 'New package'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="package-form" loading={mutation.isPending}>
            {pkg ? 'Save changes' : 'Create package'}
          </Button>
        </>
      }
    >
      <form id="package-form" noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        {mutation.isError && <Alert tone="danger">{getErrorMessage(mutation.error)}</Alert>}
        <FormField label="Name" error={errors.name?.message} required>
          {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} {...register('name')} />}
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField label="Schedule" required error={errors.schedulePattern?.message} options={SCHEDULE_PATTERNS.map((s) => ({ value: s, label: SCHEDULE_LABEL[s] }))} {...register('schedulePattern')} />
          <FormField label="Monthly price (₹)" error={errors.monthlyPrice?.message} hint="Placeholder until rates are confirmed." required>
            {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} type="number" inputMode="numeric" min={1} step={1} {...register('monthlyPrice')} />}
          </FormField>
        </div>
        <Controller
          control={control}
          name="carSizes"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-navy-800">Compatible car sizes</legend>
              <div className="flex flex-wrap gap-2">
                {CAR_SIZES.map((size: CarSize) => {
                  const on = field.value.includes(size);
                  return (
                    <button
                      key={size}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => field.onChange(on ? field.value.filter((s) => s !== size) : [...field.value, size])}
                      className={cn('min-h-[40px] rounded-full px-3 text-sm font-medium ring-1 ring-inset', on ? 'bg-brand text-white ring-brand' : 'bg-white text-navy-700 ring-navy-200 hover:bg-navy-50')}
                    >
                      {CAR_SIZE_LABEL[size]}
                    </button>
                  );
                })}
              </div>
              {errors.carSizes && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">{errors.carSizes.message}</p>}
            </fieldset>
          )}
        />
        <FormField label="Features" hint="One per line, shown on the resident’s package card.">
          {(p) => (
            <Textarea
              id={p.id}
              aria-describedby={p.describedBy}
              rows={4}
              defaultValue={getValues('features').join('\n')}
              onChange={(e) =>
                setValue(
                  'features',
                  e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          )}
        </FormField>
        <FormField label="Description" error={errors.description?.message}>
          {(p) => <Textarea id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} {...register('description')} />}
        </FormField>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-navy-800">
          <input type="checkbox" className="h-4 w-4 rounded accent-brand" {...register('active')} />
          Offered to residents
        </label>
      </form>
    </Modal>
  );
}
