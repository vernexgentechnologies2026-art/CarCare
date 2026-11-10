import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeIndianRupee, Car, Gauge, UserCheck, Users, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/feedback';
import { Alert, Card, CardHeader, Meter, PageHeader, Skeleton, StatTile } from '@/components/ui';
import { qk } from '@/hooks/queryKeys';
import { useServices } from '@/services';
import { cycleOf } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatCycle, formatDate, formatDateTime, formatINR } from '@/utils/formatters';
import { TrendChart } from './TrendChart';

/** Operations dashboard — every figure comes from summary endpoints, never raw history. */
export function AdminDashboardPage() {
  const services = useServices();
  const today = services.today();
  const cycle = cycleOf(today);
  const stats = useQuery({ queryKey: qk.admin.dashboard(today), queryFn: () => services.admin.getDashboard(today) });
  const trend = useQuery({ queryKey: qk.admin.trend(today, 14), queryFn: () => services.admin.getDailyTrend(today, 14) });
  const collections = useQuery({ queryKey: qk.payments.collections(cycle), queryFn: () => services.payments.getCollectionsSummary(cycle) });
  const pendingQuery = { page: 1, limit: 5, status: 'PENDING_APPROVAL' as const };
  const pending = useQuery({ queryKey: qk.customers.list(pendingQuery), queryFn: () => services.customers.list(pendingQuery) });

  if (stats.isError) return <ErrorState message={getErrorMessage(stats.error)} onRetry={() => void stats.refetch()} />;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Operations dashboard" description={formatDate(today)} />

      {pending.data && pending.data.total > 0 && (
        <Alert tone="warning" icon={<UserCheck className="h-4 w-4" />} title={`${pending.data.total} registration${pending.data.total > 1 ? 's' : ''} awaiting approval`}>
          <ul className="mt-1 space-y-0.5">
            {pending.data.items.map((r) => (
              <li key={r.customer.id}>
                {r.customer.name} · {r.customer.block}-{r.customer.flat} · <span className="font-mono">{r.vehicle?.registration}</span> · {formatDateTime(r.customer.createdAt)}
              </li>
            ))}
          </ul>
          <Link to="/admin/customers?tab=pending" className="mt-2 inline-flex items-center gap-1 font-semibold underline">
            Review approvals <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {s ? (
          <>
            <StatTile label="Total customers" value={s.totalCustomers.toLocaleString('en-IN')} sub={`${s.activeVehicles.toLocaleString('en-IN')} vehicles on a plan`} icon={<Users className="h-4 w-4" />} />
            <StatTile label="Today’s washes" value={`${s.completedToday} / ${s.jobsToday}`} sub={`${s.notPresentToday} not present · ${s.pendingToday} pending`} icon={<Car className="h-4 w-4" />} accent="success" />
            <StatTile label="Completion rate" value={`${s.completionRate}%`} sub="Last 7 days" icon={<Gauge className="h-4 w-4" />} accent="brand" />
            <StatTile label="Cleaners active" value={s.cleanersActive} icon={<UsersRound className="h-4 w-4" />} accent="neutral" />
            <Link to="/admin/payments?status=OVERDUE" className="col-span-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:col-span-1">
              <StatTile label="Outstanding invoices" value={s.outstandingInvoices} sub={formatINR(s.outstandingAmount)} icon={<BadgeIndianRupee className="h-4 w-4" />} accent={s.outstandingInvoices ? 'warning' : 'neutral'} />
            </Link>
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Daily wash trend · last 14 days" description="Only completed washes count toward residents’ 13-wash milestone." />
          <div className="p-4 sm:p-5">{trend.data ? <TrendChart points={trend.data} /> : <Skeleton className="h-56" />}</div>
        </Card>
        <Card>
          <CardHeader
            title={`Collections · ${formatCycle(cycle)}`}
            action={
              <Link to="/admin/payments" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                Ledger <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            }
          />
          <div className="p-4 sm:p-5">
            {collections.data ? (
              <>
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-semibold tabular-nums text-navy-900">{formatINR(collections.data.collected)}</p>
                  <p className="text-sm text-navy-500">of {formatINR(collections.data.billed)}</p>
                </div>
                <div className="mt-3">
                  <Meter value={collections.data.collected} max={collections.data.billed} tone="brand" label="Collected this month" />
                </div>
                <p className="mt-3 text-sm text-navy-600">
                  {formatINR(collections.data.outstanding)} outstanding{collections.data.overdueInvoices > 0 && ` · ${collections.data.overdueInvoices} overdue`}
                </p>
                <p className="mt-2 text-xs text-warning-700">Collections are simulated (Phase 1 mock).</p>
              </>
            ) : (
              <Skeleton className="h-20" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
