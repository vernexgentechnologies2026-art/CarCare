import { ChevronLeft, ChevronRight, Clock, MapPin, Phone, RotateCcw, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState } from '@/components/feedback';
import { JobStatusBadge } from '@/components/shared';
import { Button, Card, Meter, SearchInput, SkeletonList } from '@/components/ui';
import { useSession } from '@/hooks/useAuth';
import { useDebounced } from '@/hooks/useDebounced';
import { useJobs, useJobSummary, type JobFilter } from '@/hooks/useJobs';
import { useServices } from '@/services';
import { cn } from '@/utils/cn';
import { addDays } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatDateShort, formatPhone } from '@/utils/formatters';

const CHIPS: Array<{ value: JobFilter; label: string; key: 'total' | 'pending' | 'completed' | 'vehicleNotPresent' }> = [
  { value: 'ALL', label: 'All', key: 'total' },
  { value: 'PENDING', label: 'Pending', key: 'pending' },
  { value: 'COMPLETED', label: 'Completed', key: 'completed' },
  { value: 'VEHICLE_NOT_PRESENT', label: 'Vehicle Not Present', key: 'vehicleNotPresent' },
];

/** The cleaner's daily round. Date and filter live in the URL so Back restores them. */
export function TodaysJobsPage() {
  const session = useSession();
  const services = useServices();
  const today = services.today();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today;
  const filter = (params.get('status') as JobFilter | null) ?? 'PENDING';
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const cleanerId = session.cleanerId ?? '';
  const summary = useJobSummary(cleanerId, date);
  const { jobs, total, isPending, isError, error, refetch, isPlaceholderData, hasNextPage, fetchNextPage, isFetchingNextPage } = useJobs(cleanerId, date, filter, debounced);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        if (value === null) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );

  const s = summary.data;
  const isToday = date === today;
  const done = s ? s.completed + s.vehicleNotPresent : 0;

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-20 -mx-4 border-b border-navy-200 bg-navy-50/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" size="lg" className="w-11 px-0" aria-label="Previous day" icon={<ChevronLeft className="h-5 w-5" />} onClick={() => setParam('date', addDays(date, -1))} />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-navy-900">{isToday ? `Today · ${formatDateShort(date)}` : formatDateShort(date)}</h1>
            <p className="text-sm font-semibold tabular-nums text-navy-700" aria-live="polite">
              {s ? `${s.completed} / ${s.total} Completed` : '…'}
              {s && s.vehicleNotPresent > 0 && <span className="font-normal text-navy-500"> · {s.vehicleNotPresent} VNP</span>}
            </p>
          </div>
          <Button variant="secondary" size="lg" className="w-11 px-0" aria-label="Next day" icon={<ChevronRight className="h-5 w-5" />} onClick={() => setParam('date', addDays(date, 1))} />
        </div>
        <div className="mt-2">
          <Meter value={done} max={s?.total ?? 0} label="Jobs recorded" />
        </div>
        <div role="radiogroup" aria-label="Filter jobs" className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {CHIPS.map((c) => {
            const active = filter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setParam('status', c.value)}
                className={cn(
                  'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  active ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-navy-700 ring-navy-200',
                )}
              >
                {c.label}
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/20' : 'bg-navy-100')}>{s ? s[c.key] : '–'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!isToday && (
        <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs text-navy-600 ring-1 ring-navy-200">
          {date < today ? 'Past day · read only' : 'Upcoming · read only'}
          <button type="button" onClick={() => setParam('date', null)} className="flex min-h-[36px] items-center gap-1 font-semibold text-brand">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Today
          </button>
        </div>
      )}

      <SearchInput icon={<Search className="h-4 w-4" />} placeholder="Search registration, flat or name" aria-label="Search jobs" value={search} onChange={(e) => setSearch(e.target.value)} className="[&_input]:h-11" />

      {isPending ? (
        <SkeletonList rows={5} />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : jobs.length === 0 ? (
        <Card>
          <EmptyState
            title={filter === 'PENDING' && s && s.total > 0 && !debounced ? 'Round complete' : 'No jobs here'}
            description={filter === 'PENDING' && s && s.total > 0 && !debounced ? 'Every car on this list has been recorded.' : 'Try a different filter or search.'}
          />
        </Card>
      ) : (
        <>
          <ul className={cn('space-y-2 transition-opacity', isPlaceholderData && 'opacity-60')}>
            {jobs.map((job) => (
              <li key={job.id} className="rounded-xl bg-white shadow-card ring-1 ring-navy-200/70">
                <Link to={`/cleaner/jobs/${job.id}`} className="block rounded-t-xl p-4 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-lg font-bold tracking-tight text-navy-900">{job.vehicle.registration}</p>
                      <p className="truncate text-sm text-navy-600">
                        {job.owner.name} · {job.vehicle.makeModel}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-navy-900 px-2 py-1 text-sm font-semibold text-white">
                      {job.owner.block}-{job.owner.flat}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-navy-600">
                    <JobStatusBadge status={job.status} />
                    {job.isReschedule && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">Makeup wash</span>}
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      Slot {job.vehicle.parkingSlot}
                    </span>
                  </div>
                  {job.vehicle.timeRestriction && (
                    <p className="mt-2 flex items-center gap-1.5 rounded-md bg-warning-50 px-2 py-1 text-xs font-medium text-warning-700">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {job.vehicle.timeRestriction}
                    </p>
                  )}
                </Link>
                <a
                  href={`tel:+91${job.owner.phone}`}
                  className="flex min-h-[44px] items-center justify-center gap-2 border-t border-navy-100 text-sm font-semibold text-brand hover:bg-brand-50"
                  aria-label={`Call ${job.owner.name}, ${formatPhone(job.owner.phone)}`}
                >
                  <Phone className="h-4 w-4" aria-hidden /> Call resident
                </a>
              </li>
            ))}
          </ul>
          <p className="text-center text-xs text-navy-500">
            Showing {jobs.length} of {total}
          </p>
          {hasNextPage && (
            <Button block size="lg" variant="secondary" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              Load more jobs
            </Button>
          )}
        </>
      )}
    </div>
  );
}
