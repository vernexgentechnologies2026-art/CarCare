import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, Camera, Car, Clock, Package, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Alert, Card, CardHeader, RadialGauge, Skeleton, SkeletonList } from '@/components/ui';
import { SCHEDULE_LABEL, SERVICE_WINDOW_BY_BLOCK } from '@/constants';
import { WashHistoryList } from '@/features/washes/WashHistoryList';
import { qk } from '@/hooks/queryKeys';
import { useSession } from '@/hooks/useAuth';
import { useWashProgress } from '@/hooks/useWashProgress';
import { useServices } from '@/services';
import { getErrorMessage } from '@/utils/errors';
import { formatCycle, formatDate, formatINR } from '@/utils/formatters';
import { useMyAccount, useSelectedVehicle } from './useMyAccount';
import { VehicleSwitcher } from './VehicleSwitcher';

export function CustomerDashboardPage() {
  const session = useSession();
  const services = useServices();
  const today = services.today();
  const account = useMyAccount();
  const { vehicle, select, query: vq } = useSelectedVehicle(account.data?.vehicles);
  const vehicleId = vehicle?.id ?? '';
  const progress = useWashProgress(vehicle?.package ? vehicleId : undefined);

  const nextWash = useQuery({ queryKey: qk.washes.next(vehicleId, today), queryFn: () => services.washes.getNextWashDate(vehicleId, today), enabled: Boolean(vehicle?.package) });
  const recentQuery = { vehicleId, page: 1, limit: 4 };
  const recent = useQuery({ queryKey: qk.washes.history(recentQuery), queryFn: () => services.washes.getCustomerHistory(recentQuery), enabled: Boolean(vehicleId) });
  const summary = useQuery({ queryKey: qk.payments.summary(account.customerId), queryFn: () => services.payments.getAccountSummary(account.customerId) });

  if (account.isError) return <ErrorState message={getErrorMessage(account.error)} onRetry={() => void account.refetch()} />;
  const block = account.data?.customer.block ?? '';
  const p = progress.data;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-navy-900">Hello, {session.displayName.split(' ')[0]}</h1>
          <p className="text-sm text-navy-500">{account.data ? `Block ${account.data.customer.block}, Flat ${account.data.customer.flat}` : ' '}</p>
        </div>
        {vehicle && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-3 py-1.5 font-mono text-xs font-bold text-white" aria-label={`Vehicle ${vehicle.registration}`}>
            <Car className="h-3.5 w-3.5" aria-hidden />
            {vehicle.registration}
          </span>
        )}
      </div>

      {account.data && <VehicleSwitcher vehicles={account.data.vehicles} selectedId={vehicle?.id} onSelect={select} />}

      {summary.data && summary.data.outstanding > 0 && (
        <Link to="/customer/invoices" className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Alert tone={summary.data.overdueCount > 0 ? 'danger' : 'warning'} icon={<AlertTriangle className="h-4 w-4" />} title={`${formatINR(summary.data.outstanding)} outstanding`}>
            {summary.data.overdueCount > 0 ? 'A payment is overdue. Tap to pay now.' : 'Your monthly invoice is ready. Tap to pay.'}
          </Alert>
        </Link>
      )}

      {vehicle && !vehicle.package ? (
        <Card className="p-5">
          <Package className="h-8 w-8 text-brand" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-navy-900">Choose your wash package</h2>
          <p className="mt-1 text-sm text-navy-500">Your registration is approved. Pick a schedule for {vehicle.registration} to start your washes.</p>
          <Link to={`/customer/packages${vq}`} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700">
            See packages <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="13-wash milestone" description={`${formatCycle(progress.cycle)} · only completed washes count`} />
            <div className="flex flex-col items-center gap-4 p-5">
              {progress.isPending ? (
                <Skeleton className="h-[176px] w-[176px] rounded-full" />
              ) : p ? (
                <RadialGauge value={p.completed} max={p.target} size={176} label="Completed washes this month" />
              ) : null}
              <dl className="grid w-full grid-cols-3 gap-2 text-center">
                <Stat label="Completed" value={p ? `${p.completed} / ${p.target}` : '–'} />
                <Stat label="Remaining" value={p ? String(p.remaining) : '–'} />
                <Stat label="Complete" value={p ? `${p.percent}%` : '–'} />
              </dl>
              {p && p.vehicleNotPresent > 0 && <p className="text-xs text-navy-500">{p.vehicleNotPresent} vehicle-not-present day{p.vehicleNotPresent > 1 ? 's' : ''} this month — these don’t count. You can request a reschedule.</p>}
            </div>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-navy-500">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Upcoming wash
            </p>
            {nextWash.isPending ? (
              <Skeleton className="mt-2 h-10" />
            ) : (
              <>
                <p className="mt-1 text-lg font-semibold text-navy-900">{nextWash.data ? (nextWash.data === today ? 'Today' : formatDate(nextWash.data)) : 'Not scheduled'}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-navy-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> Service window {SERVICE_WINDOW_BY_BLOCK[block] ?? '—'}
                  </span>
                  {vehicle?.package && <span>{SCHEDULE_LABEL[vehicle.package.schedulePattern]}</span>}
                </p>
              </>
            )}
          </Card>
        </>
      )}

      <nav aria-label="Quick actions" className="grid grid-cols-3 gap-2">
        <QuickAction to={`/customer/photos${vq}`} icon={<Camera className="h-5 w-5" />} label="View Wash Photos" />
        <QuickAction to={`/customer/reschedule${vq}`} icon={<CalendarClock className="h-5 w-5" />} label="Request Reschedule" />
        <QuickAction to="/customer/invoices" icon={<Receipt className="h-5 w-5" />} label="Billing / Pay Dues" />
      </nav>

      <Card>
        <CardHeader
          title="Recent washes"
          action={
            <Link to={`/customer/photos${vq}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              All photos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        />
        {recent.isPending ? (
          <div className="p-4">
            <SkeletonList rows={2} />
          </div>
        ) : recent.data && recent.data.items.length > 0 ? (
          <WashHistoryList entries={recent.data.items} />
        ) : (
          <EmptyState title="No washes yet" description="Your wash history appears here after the first visit." />
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-navy-50 px-2 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-navy-500">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-navy-900">{value}</dd>
    </div>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-xl bg-white p-2 text-center text-xs font-semibold text-navy-800 shadow-card ring-1 ring-navy-200/70 hover:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="rounded-lg bg-brand-50 p-2 text-brand">{icon}</span>
      {label}
    </Link>
  );
}
