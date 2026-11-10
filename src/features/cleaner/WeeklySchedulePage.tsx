import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/feedback';
import { Button, Card, CardHeader, PageHeader, Skeleton } from '@/components/ui';
import { qk } from '@/hooks/queryKeys';
import { useSession } from '@/hooks/useAuth';
import { useServices } from '@/services';
import { cn } from '@/utils/cn';
import { addDays, parseISODate } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/formatters';

/** 7-day carousel of scheduled vehicle counts, broken down by block. */
export function WeeklySchedulePage() {
  const session = useSession();
  const services = useServices();
  const today = services.today();
  const [from, setFrom] = useState(today);
  const [selected, setSelected] = useState(today);
  const cleanerId = session.cleanerId ?? '';
  const week = useQuery({ queryKey: qk.cleaners.week(cleanerId, from), queryFn: () => services.cleaners.getWeekSchedule(cleanerId, from, 7), enabled: Boolean(cleanerId) });
  const day = week.data?.find((d) => d.date === selected) ?? week.data?.[0];
  const blocks = day ? Object.entries(day.byBlock).filter(([, n]) => n > 0) : [];

  const shift = (days: number) => {
    const next = addDays(from, days);
    setFrom(next);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Weekly schedule" description="Cars scheduled for you each day, by block." />
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="lg" className="w-11 shrink-0 px-0" aria-label="Previous week" icon={<ChevronLeft className="h-5 w-5" />} onClick={() => shift(-7)} disabled={from <= today} />
        <div role="tablist" aria-label="Days" className="flex flex-1 snap-x gap-2 overflow-x-auto pb-1">
          {week.isPending
            ? Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-20 w-16 shrink-0" />)
            : week.data?.map((d) => {
                const date = parseISODate(d.date);
                const active = d.date === day?.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelected(d.date)}
                    className={cn(
                      'flex min-h-[80px] w-16 shrink-0 snap-start flex-col items-center justify-center rounded-xl ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      active ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-navy-800 ring-navy-200',
                    )}
                  >
                    <span className="text-[11px] font-medium uppercase">{date.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                    <span className="text-lg font-semibold">{date.getDate()}</span>
                    <span className={cn('text-[11px] tabular-nums', active ? 'text-navy-300' : 'text-navy-500')}>{d.total} cars</span>
                  </button>
                );
              })}
        </div>
        <Button variant="secondary" size="lg" className="w-11 shrink-0 px-0" aria-label="Next week" icon={<ChevronRight className="h-5 w-5" />} onClick={() => shift(7)} />
      </div>

      {week.isError ? (
        <ErrorState message={getErrorMessage(week.error)} onRetry={() => void week.refetch()} />
      ) : day ? (
        <Card>
          <CardHeader title={day.date === today ? 'Today' : formatDate(day.date)} description={`${day.total} cars scheduled`} />
          {blocks.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-navy-500">No washes scheduled.</p>
          ) : (
            <ul className="divide-y divide-navy-100">
              {blocks.map(([block, n]) => (
                <li key={block} className="flex min-h-[52px] items-center justify-between px-4">
                  <span className="text-sm font-semibold text-navy-900">Block {block}</span>
                  <span className="text-sm tabular-nums text-navy-700">{n} cars</span>
                </li>
              ))}
            </ul>
          )}
          {day.date === today && (
            <Link to="/cleaner/today" className="flex min-h-[48px] items-center justify-center border-t border-navy-100 text-sm font-semibold text-brand hover:bg-brand-50">
              Open today’s job list
            </Link>
          )}
        </Card>
      ) : null}
    </div>
  );
}
