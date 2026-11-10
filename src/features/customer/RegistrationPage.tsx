import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { FormField, SelectField } from '@/components/forms';
import { Logo, ReviewBanner } from '@/components/shared';
import { Alert, Button, Card, Input } from '@/components/ui';
import { BLOCKS, CAR_SIZE_HINT, CAR_SIZE_LABEL, CAR_SIZES } from '@/constants';
import { homeFor } from '@/features/auth/permissions';
import { useAuth } from '@/hooks/useAuth';
import { registrationSchema, type RegistrationInput, type RegistrationValues } from '@/schemas';
import { useServices } from '@/services';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';

const STEPS: Array<{ title: string; fields: Array<keyof RegistrationInput> }> = [
  { title: 'Owner & flat', fields: ['name', 'phone', 'block', 'flat', 'parkingSlot'] },
  { title: 'Vehicle', fields: ['registration', 'makeModel', 'carSize', 'password'] },
];

/** Resident registration (Zod-validated). Ends signed in on the approval-status screen. */
export function RegistrationPage() {
  const { auth } = useServices();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationInput, unknown, RegistrationValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { name: '', phone: '', registration: '', makeModel: '', carSize: undefined, block: '', flat: '', parkingSlot: '', password: '' },
    mode: 'onTouched',
  });
  const carSize = useWatch({ control, name: 'carSize' });

  const next = async () => {
    const current = STEPS[step];
    if (current && (await trigger(current.fields))) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await auth.registerCustomer(values);
      const session = await login(values.phone, values.password);
      navigate(homeFor(session), { replace: true });
    } catch (e) {
      setSubmitError(getErrorMessage(e));
    }
  });

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Register your vehicle</h1>
      <p className="mt-1 text-sm text-navy-500">The facility office reviews every registration. You’ll choose your wash package once approved.</p>

      <ol className="mt-6 flex items-center gap-2" aria-label="Registration steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-1 items-center gap-2" aria-current={i === step ? 'step' : undefined}>
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', i < step ? 'bg-success text-white' : i === step ? 'bg-brand text-white' : 'bg-navy-200 text-navy-600')}>
              {i < step ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-sm font-medium', i === step ? 'text-navy-900' : 'text-navy-500')}>{s.title}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-navy-200" aria-hidden />}
          </li>
        ))}
      </ol>

      <Card className="mt-6 p-5">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {submitError && <Alert tone="danger">{submitError}</Alert>}

          {step === 0 && (
            <>
              <FormField label="Owner name" error={errors.name?.message} required>
                {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} autoComplete="name" {...register('name')} />}
              </FormField>
              <FormField label="Mobile number" error={errors.phone?.message} hint="You’ll sign in with this number." required>
                {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" {...register('phone')} />}
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Block" error={errors.block?.message} required placeholder="Select" options={BLOCKS.map((b) => ({ value: b, label: `Block ${b}` }))} {...register('block')} />
                <FormField label="Flat number" error={errors.flat?.message} required>
                  {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} inputMode="numeric" placeholder="302" {...register('flat')} />}
                </FormField>
              </div>
              <FormField label="Parking slot" error={errors.parkingSlot?.message} hint="As painted on the floor, e.g. B1-A-045" required>
                {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} autoCapitalize="characters" className="uppercase" placeholder="B1-A-045" {...register('parkingSlot')} />}
              </FormField>
            </>
          )}

          {step === 1 && (
            <>
              <FormField label="Vehicle registration number" error={errors.registration?.message} hint="e.g. TN-09-AB-1234" required>
                {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} autoCapitalize="characters" className="uppercase" placeholder="TN-09-AB-1234" {...register('registration')} />}
              </FormField>
              <FormField label="Make & model" error={errors.makeModel?.message} required>
                {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} placeholder="Hyundai Creta" {...register('makeModel')} />}
              </FormField>
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-navy-800">
                  Car size class
                  <span className="ml-0.5 text-danger" aria-hidden>
                    *
                  </span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {CAR_SIZES.map((size) => (
                    <label
                      key={size}
                      className={cn(
                        'flex min-h-[56px] cursor-pointer flex-col justify-center rounded-lg px-3 py-2 ring-1 ring-inset',
                        carSize === size ? 'bg-brand-50 ring-brand' : 'bg-white ring-navy-200 hover:bg-navy-50',
                      )}
                    >
                      <input type="radio" value={size} className="sr-only" {...register('carSize')} />
                      <span className={cn('text-sm font-semibold', carSize === size ? 'text-brand-700' : 'text-navy-900')}>{CAR_SIZE_LABEL[size]}</span>
                      <span className="text-xs text-navy-500">{CAR_SIZE_HINT[size]}</span>
                    </label>
                  ))}
                </div>
                {errors.carSize && (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
                    {errors.carSize.message}
                  </p>
                )}
              </fieldset>
              <FormField label="Create a password" error={errors.password?.message} hint="At least 8 characters with a letter and a number." required>
                {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} type="password" autoComplete="new-password" {...register('password')} />}
              </FormField>
            </>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {step > 0 ? (
              <Button variant="ghost" size="lg" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : (
              <Link to="/login" className="text-sm font-medium text-navy-600 hover:text-navy-900">
                Have an account? Sign in
              </Link>
            )}
            {step < STEPS.length - 1 ? (
              <Button size="lg" onClick={() => void next()}>
                Continue <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button type="submit" size="lg" loading={isSubmitting}>
                Submit registration
              </Button>
            )}
          </div>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-navy-50">
      <ReviewBanner />
      <div className="mx-auto max-w-md px-4 pb-28 pt-8">
        <div className="mb-8">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
