import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/services';
import type { CleanerJob, ISODate, JobStatus } from '@/types';
import { qk } from './queryKeys';

export type JobFilter = JobStatus | 'ALL';

const PAGE_SIZE = 20;

/**
 * A cleaner's jobs for one day, filtered and searched server-side and loaded
 * a page at a time ("Load more"), per the capacity budget.
 */
export function useJobs(cleanerId: string, date: ISODate, status: JobFilter = 'ALL', search = '') {
  const services = useServices();
  const base = { cleanerId, date, status, search: search.trim(), limit: PAGE_SIZE };
  const query = useInfiniteQuery({
    queryKey: qk.washes.jobs(base),
    queryFn: ({ pageParam }) => services.washes.getCleanerJobs({ ...base, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: Boolean(cleanerId),
  });
  return { ...query, jobs: query.data?.pages.flatMap((p) => p.items) ?? [], total: query.data?.pages[0]?.total ?? 0 };
}

/** Header / filter-chip counts for the day — a summary endpoint, no job rows. */
export function useJobSummary(cleanerId: string, date: ISODate) {
  const { washes } = useServices();
  return useQuery({ queryKey: qk.washes.jobSummary(cleanerId, date), queryFn: () => washes.getJobSummary(cleanerId, date), enabled: Boolean(cleanerId) });
}

export function useJob(jobId: string) {
  const { washes } = useServices();
  return useQuery({ queryKey: qk.washes.job(jobId), queryFn: () => washes.getJob(jobId) });
}

/** Shared cache updates after a cleaner records any outcome. */
function useOnRecorded() {
  const queryClient = useQueryClient();
  return async (updated: CleanerJob) => {
    queryClient.setQueryData(qk.washes.job(updated.id), updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.washes.all }),
      queryClient.invalidateQueries({ queryKey: qk.cleaners.all }),
      queryClient.invalidateQueries({ queryKey: qk.admin.all }),
    ]);
  };
}

export function useCompleteWash(jobId: string) {
  const { washes } = useServices();
  const onRecorded = useOnRecorded();
  return useMutation({ mutationFn: (photo: Blob) => washes.completeWash({ jobId, photo }), onSuccess: onRecorded });
}

export function useMarkNotPresent(jobId: string) {
  const { washes } = useServices();
  const onRecorded = useOnRecorded();
  return useMutation({ mutationFn: (note: string) => washes.markVehicleNotPresent({ jobId, note }), onSuccess: onRecorded });
}
