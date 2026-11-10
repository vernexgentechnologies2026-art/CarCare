import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState } from '@/components/feedback';
import { Button, Card, CardHeader, DescriptionList, Select, Skeleton } from '@/components/ui';
import { BLOCKS, SCHEDULE_LABEL, SCHEDULE_PATTERNS, SCHEDULE_WEEKDAYS } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useServices } from '@/services';
import type { CalendarDay, CycleMonth } from '@/types';
import { cn } from '@/utils/cn';
import { cycleOf, firstDayOfCycle, parseISODate, previousCycle, toISODate, weekdayOf } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatCycle, formatDate } from '@/utils/formatters';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const nextCycle = (cycle: CycleMonth): CycleMonth => {
  const d = parseISODate(firstDayOfCycle(cycle));
  d.setMonth(d.getMonth() + 1);
  return cycleOf(toISODate(d));
};

/**
 * Month view of every scheduled wash across the society. Past days show
 * recorded outcomes; future days show the planned load (including approved
 * reschedules), which is what cleaner allocation is balanced against.
 */
export function MasterCalendar() {
  const services = useServices();
  const today = services.today();
  const [cycle, setCycle] = useState(cycleOf(today));
  const [block, setBlock] = useState('ALL');
  const [selected, setSelected] = useState<string | null>(today);
  const [showTable, setShowTable] = useState(false);

  const calendar = useQuery({
    queryKey: qk.schedules.calendar(cycle, block),
    queryFn: () => services.schedules.getMasterCalendar(cycle, block),
    placeholderData: keepPreviousData,
  });

  const days = useMemo(() => calendar.data ?? [], [calendar.data]);
  const max = Math.max(1, ...days.map((d) => d.scheduled));
  // Monday-first grid: pad the first week.
  const leading = days.length ? (weekdayOf(days[0]?.date ?? today) + 6) % 7 : 0;
  const selectedDay = days.find((d) => d.date === selected) ?? null;
  const totals = useMemo(
    () => days.reduce((t, d) => ({ scheduled: t.scheduled + d.scheduled, completed: t.completed + d.completed, notPresent: t.notPresent + d.notPresent }), { scheduled: 0, completed: 0, notPresent: 0 }),
    [days],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Block" value={block} onChange={(e) => setBlock(e.target.value)} className="w-36">
          <option value="ALL">All blocks</option>
          {BLOCKS.map((b) => (
            <option key={b} value={b}>
              Block {b}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" aria-label="Previous month" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setCycle(previousCycle(cycle))} />
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-navy-900">{formatCycle(cycle)}</span>
          <Button variant="secondary" size="sm" aria-label="Next month" icon={<ChevronRight className="h-4 w-4" />} onClick={() => setCycle(nextCycle(cycle))} />
        </div>
        {cycle !== cycleOf(today) && (
          <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { setCycle(cycleOf(today)); setSelected(today); }}>
            This month
          </Button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader
            title={`${totals.scheduled.toLocaleString('en-IN')} washes scheduled`}
            description={`${totals.completed.toLocaleString('en-IN')} completed · ${totals.notPresent.toLocaleString('en-IN')} vehicle not present so far`}
            action={
              <button type="button" onClick={() => setShowTable((v) => !v)} className="text-xs font-semibold text-brand hover:underline" aria-pressed={showTable}>
                {showTable ? 'Show calendar' : 'Show table'}
              </button>
            }
          />
          <div className="p-3 sm:p-4">
            <Legend />
            {calendar.isPending ? (
              <Skeleton className="mt-3 h-96" />
            ) : calendar.isError ? (
              <ErrorState message={getErrorMessage(calendar.error)} onRetry={() => void calendar.refetch()} />
            ) : showTable ? (
              <CalendarTable days={days} />
            ) : (
              <div className={cn('mt-3 transition-opacity', calendar.isPlaceholderData && 'opacity-60')}>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-navy-500" aria-hidden>
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div role="grid" aria-label={`Washes in ${formatCycle(cycle)}`} className="grid grid-cols-7 gap-1">
                  {Array.from({ length: leading }, (_, i) => (
                    <div key={`pad-${i}`} aria-hidden />
                  ))}
                  {days.map((d) => (
                    <DayCell key={d.date} day={d} max={max} today={today} selected={selected === d.date} onSelect={() => setSelected(d.date)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={selectedDay ? formatDate(selectedDay.date) : 'Select a day'} description={selectedDay ? DAY_NAMES[weekdayOf(selectedDay.date)] : undefined} />
            <div className="px-4 pb-2 sm:px-5">
              {selectedDay ? (
                <DescriptionList
                  items={[
                    { label: 'Scheduled', value: selectedDay.scheduled },
                    { label: 'Completed', value: selectedDay.date > today ? '—' : selectedDay.completed },
                    { label: 'Vehicle not present', value: selectedDay.date > today ? '—' : selectedDay.notPresent },
                    {
                      label: 'Not recorded',
                      value: selectedDay.date > today ? '—' : selectedDay.scheduled - selectedDay.completed - selectedDay.notPresent,
                    },
                    { label: 'Rescheduled washes', value: selectedDay.rescheduled },
                  ]}
                />
              ) : (
                <p className="py-4 text-sm text-navy-500">Tap a day to see its breakdown.</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Schedule patterns" description="Which weekdays each plan is serviced" />
            <ul className="divide-y divide-navy-100 text-sm">
              {SCHEDULE_PATTERNS.map((p) => (
                <li key={p} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <span className="font-medium text-navy-800">{SCHEDULE_LABEL[p]}</span>
                  <span className="text-xs text-navy-500">{SCHEDULE_WEEKDAYS[p].length === 7 ? 'Every day' : SCHEDULE_WEEKDAYS[p].map((w) => DAY_NAMES[w]).join(', ')}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { label: 'Completed', cls: 'bg-success' },
    { label: 'Vehicle not present', cls: 'bg-warning' },
    { label: 'Not recorded / upcoming', cls: 'bg-navy-300' },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-600" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-sm', i.cls)} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function DayCell({ day, max, today, selected, onSelect }: { day: CalendarDay; max: number; today: string; selected: boolean; onSelect: () => void }) {
  const isFuture = day.date > today;
  const open = Math.max(0, day.scheduled - day.completed - day.notPresent);
  const dayNum = parseISODate(day.date).getDate();
  const label = isFuture
    ? `${formatDate(day.date)}: ${day.scheduled} scheduled`
    : `${formatDate(day.date)}: ${day.completed} completed, ${day.notPresent} not present, ${open} not recorded`;
  const segments = isFuture
    ? [{ v: day.scheduled, cls: 'bg-navy-300' }]
    : [
        { v: day.completed, cls: 'bg-success' },
        { v: day.notPresent, cls: 'bg-warning' },
        { v: open, cls: 'bg-navy-300' },
      ];
  return (
    <button
      type="button"
      role="gridcell"
      aria-selected={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        'flex min-h-[4.5rem] flex-col rounded-lg p-1.5 text-left ring-1 ring-inset transition-colors sm:min-h-[5.5rem] sm:p-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        selected ? 'bg-brand-50 ring-brand' : 'bg-white ring-navy-200 hover:bg-navy-50',
      )}
    >
      <span className="flex items-center justify-between">
        <span className={cn('text-xs font-semibold', day.date === today ? 'rounded-full bg-navy-900 px-1.5 text-white' : 'text-navy-700')}>{dayNum}</span>
        {day.rescheduled > 0 && <span className="hidden rounded bg-brand-50 px-1 text-[10px] font-medium text-brand-700 sm:inline">+{day.rescheduled}</span>}
      </span>
      <span className="mt-auto text-sm font-semibold tabular-nums text-navy-900 sm:text-base">{day.scheduled}</span>
      {/* stacked bar, width proportional to the busiest day */}
      <span className="mt-1 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-navy-100" style={{ width: `${Math.max(8, (day.scheduled / max) * 100)}%` }} aria-hidden>
        {segments.map((s, i) => (s.v > 0 ? <span key={i} className={s.cls} style={{ flexGrow: s.v, flexBasis: 0 }} /> : null))}
      </span>
    </button>
  );
}

function CalendarTable({ days }: { days: CalendarDay[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">Washes per day</caption>
        <thead>
          <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-navy-500">
            <th scope="col" className="py-2 pr-4">Date</th>
            <th scope="col" className="py-2 pr-4 text-right">Scheduled</th>
            <th scope="col" className="py-2 pr-4 text-right">Completed</th>
            <th scope="col" className="py-2 pr-4 text-right">Not present</th>
            <th scope="col" className="py-2 text-right">Rescheduled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-100 tabular-nums">
          {days.map((d) => (
            <tr key={d.date}>
              <td className="py-1.5 pr-4 text-navy-800">{formatDate(d.date)}</td>
              <td className="py-1.5 pr-4 text-right">{d.scheduled}</td>
              <td className="py-1.5 pr-4 text-right">{d.completed}</td>
              <td className="py-1.5 pr-4 text-right">{d.notPresent}</td>
              <td className="py-1.5 text-right">{d.rescheduled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
