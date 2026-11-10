import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, LogIn, ShieldCheck, Sparkles, UserRound, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { HOME_BY_ROLE, homeFor } from '@/features/auth/permissions';
import { Logo, ReviewBanner } from '@/components/shared';
import { Button, Alert, Card, Input } from '@/components/ui';
import { FormField } from '@/components/forms';
import { loginSchema, type LoginInput, type LoginValues } from '@/schemas';
import type { Role } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { formatPhone } from '@/utils/formatters';
import { useServices } from '@/services';

const ROLE_ICON: Record<Role, typeof ShieldCheck> = { ADMIN: ShieldCheck, CLEANER: Wrench, CUSTOMER: UserRound };

export function LoginPage() {
  const { auth } = useServices();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const from = (location.state as { from?: string } | null)?.from;

  const { data: demoAccounts = [] } = useQuery({ queryKey: ['demo-accounts'], queryFn: () => auth.getDemoAccounts(), staleTime: Infinity });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput, unknown, LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { phone: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const session = await login(values.phone, values.password);
      const home = homeFor(session);
      navigate(from && home === HOME_BY_ROLE[session.role] && from.startsWith(`/${session.role.toLowerCase()}`) ? from : home, { replace: true });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  });

  return (
    <div className="flex min-h-dvh flex-col bg-navy-50">
      <ReviewBanner />
      <div className="grid flex-1 lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <Logo inverted />
          <div className="max-w-md">
            <p className="inline-flex items-center gap-2 rounded-full bg-navy-800 px-3 py-1 text-xs font-medium text-navy-300">
              <Sparkles className="h-3.5 w-3.5 text-success" aria-hidden /> Residential car care, managed
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">Every wash scheduled, photographed and accounted for.</h1>
            <p className="mt-4 text-navy-300">
              One place for residents to track washes and pay, for cleaners to run their daily round, and for the facility office to keep
              everything on schedule.
            </p>
          </div>
          <p className="text-xs text-navy-500">© {new Date().getFullYear()} CarCare</p>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-sm">
            <div className="mb-8 lg:hidden">
              <Logo />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-navy-900">Sign in</h2>
            <p className="mt-1 text-sm text-navy-500">Use the mobile number registered with your facility office.</p>

            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              {error && <Alert tone="danger">{error}</Alert>}
              <FormField label="Mobile number" error={errors.phone?.message} required>
                {(p) => (
                  <Input
                    id={p.id}
                    aria-describedby={p.describedBy}
                    invalid={p.invalid}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    {...register('phone')}
                  />
                )}
              </FormField>
              <FormField label="Password" error={errors.password?.message} required>
                {(p) => (
                  <div className="relative">
                    <Input
                      id={p.id}
                      aria-describedby={p.describedBy}
                      invalid={p.invalid}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="pr-10"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-navy-400 hover:text-navy-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </FormField>
              <Button type="submit" block size="lg" loading={isSubmitting} icon={<LogIn className="h-4 w-4" />}>
                Sign in
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-navy-600">
              New resident?{' '}
              <Link to="/register" className="font-semibold text-brand hover:underline">
                Register your vehicle
              </Link>
            </p>

            {demoAccounts.length > 0 && (
              <Card className="mt-8 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Review accounts</p>
                <p className="mt-1 text-xs text-navy-500">Fills the form with a sample account for each role.</p>
                <div className="mt-3 space-y-2">
                  {demoAccounts.map((a) => {
                    const Icon = ROLE_ICON[a.role];
                    return (
                      <button
                        key={a.phone}
                        type="button"
                        onClick={() => {
                          setValue('phone', a.phone, { shouldValidate: true });
                          setValue('password', a.password, { shouldValidate: true });
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ring-1 ring-navy-200 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <Icon className="h-4 w-4 text-navy-500" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-navy-900">{a.label}</span>
                          <span className="block text-xs text-navy-500">{formatPhone(a.phone)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
