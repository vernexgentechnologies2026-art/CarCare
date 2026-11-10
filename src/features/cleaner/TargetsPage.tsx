import { useQuery } from '@tanstack/react-query';
import { CarFront, CheckCircle2, ListChecks } from 'lucide-react';
import { useMemo } from 'react';
import { ErrorState } from '@/components/feedback';
import { Card, CardHeader, Meter, PageHeader, Skeleton, StatTile } from '@/components/ui';
import { qk } from '@/hooks/queryKeys';
import { useSession } from '@/hooks/useAuth';
import { useServices } from '@/services';
import { cycleOf, lastDayOfCycle } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatCycle, formatDateShort } from '@/utils/formatters';

/**
 * Monthly targets: washes completed vs the month's assigned goal (every car
 * scheduled for this cleaner this month), plus the vehicle-not-present count.
 */
export function TargetsPage() {
  const session = useSession();
  const services = useServices();
  const today = services.today();
  const cycle = cycleOf(today);
  const cleanerId = session.cleanerId ?? '';
  const monthEnd = lastDayOfCycle(cycle);
  const month = useQuery({
    queryKey: qk.cleaners.month(cleanerId, cycle, monthEnd),
    queryFn: () => services.cleaners.getMonthSummary(cleanerId, cycle, monthEnd),
    enabled: Boolean(cleanerId),
  });

  const t = useMemo(() => {
    const days = month.data ?? [];
    const goal = days.reduce((s, d) => s + d.scheduled, 0);
    const completed = days.reduce((s, d) => s + d.completed, 0);
    const vnp = days.reduce((s, d) => s + d.notPresent, 0);
    const toDate = days.filter((d) => d.date <= today).reduce((s, d) => s + d.scheduled, 0);
    return { goal, completed, vnp, toDate, days: days.filter((d) => d.date <= today && d.scheduled > 0).reverse() };
  }, [month.data, today]);

  if (month.isError) return <ErrorState message={getErrorMessage(month.error)} onRetry={() => void month.refetch()} />;
  const pct = t.goal ? Math.round((t.completed / t.goal) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Monthly targets" description={formatCycle(cycle)} />
      <Card className="p-5">
        {month.isPending ? (
          <Skeleton className="h-20" />
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-navy-700">Washes completed</p>
              <p className="tabular-nums text-navy-900">
                <span className="text-2xl font-semibold">{t.completed}</span> / {t.goal} goal
              </p>
            </div>
            <div className="mt-3">
              <Meter value={t.completed} max={t.goal} label="Monthly completion progress" />
            </div>
            <p className="mt-2 text-xs text-navy-500">
              {pct}% of the month’s assigned washes · {t.toDate} scheduled up to today
            </p>
          </>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Completed" value={t.completed} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" />
        <StatTile label="VNP" value={t.vnp} sub="Not counted" icon={<CarFront className="h-4 w-4" />} accent="warning" />
        <StatTile label="Goal" value={t.goal} icon={<ListChecks className="h-4 w-4" />} accent="neutral" />
      </div>

      <Card>
        <CardHeader title="Day by day" />
        {month.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : (
          <ul className="divide-y divide-navy-100">
            {t.days.map((d) => (
              <li key={d.date} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-navy-800">{d.date === today ? 'Today' : formatDateShort(d.date)}</span>
                  <span className="tabular-nums text-navy-600">
                    {d.completed} washed · {d.notPresent} VNP · {d.scheduled} scheduled
                  </span>
                </div>
                <div className="mt-1.5">
                  <Meter value={d.completed + d.notPresent} max={d.scheduled} label={`${formatDateShort(d.date)} recorded`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
