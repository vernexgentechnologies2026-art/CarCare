import type {
  AdminPhotoEntry,
  CleanerJob,
  CleanerJobQuery,
  CompleteWashInput,
  CustomerHistoryQuery,
  CustomerWashEntry,
  CycleMonth,
  ISODate,
  JobSummary,
  MonthlyWashRollup,
  NotPresentInput,
  PageQuery,
  Paginated,
  PhotoQuery,
  RollupQuery,
  SignedPhotoUrl,
  WashProgress,
  WashSummary,
  WashSummaryQuery,
} from '@/types';

export interface IWashService {
  /** A cleaner's jobs for one day (cleaners: own jobs only). */
  getCleanerJobs(query: CleanerJobQuery): Promise<Paginated<CleanerJob>>;
  /** Counts for the day's header and filter chips — no job rows. */
  getJobSummary(cleanerId: string, date: ISODate): Promise<JobSummary>;
  getJob(jobId: string): Promise<CleanerJob>;
  /** Rejects with PHOTO_REQUIRED unless a valid compressed image is supplied. */
  completeWash(input: CompleteWashInput): Promise<CleanerJob>;
  /** Records VEHICLE_NOT_PRESENT and an audit entry; never counts toward the milestone. */
  markVehicleNotPresent(input: NotPresentInput): Promise<CleanerJob>;
  /** Customer-facing history: dates only — no times, cleaner names or ids. */
  getCustomerHistory(query: CustomerHistoryQuery): Promise<Paginated<CustomerWashEntry>>;
  /** Archived months as summaries (older than the detailed window). */
  getMonthlyRollups(query: RollupQuery): Promise<Paginated<MonthlyWashRollup>>;
  /** Missed (vehicle-not-present) washes that can still be rescheduled. */
  getReschedulableMisses(vehicleId: string, query: PageQuery): Promise<Paginated<ISODate>>;
  getProgress(vehicleId: string, cycle: CycleMonth): Promise<WashProgress>;
  /** Next scheduled wash on or after `from`, or null if none within 14 days. */
  getNextWashDate(vehicleId: string, from: ISODate): Promise<ISODate | null>;
  /** Aggregates over a date range for dashboards (admin, or a cleaner for themself). */
  getWashSummary(query: WashSummaryQuery): Promise<WashSummary>;
  listPhotos(query: PhotoQuery): Promise<Paginated<AdminPhotoEntry>>;
  /** Returns a short-lived signed URL for a privately stored photo. */
  getPhotoUrl(photoId: string): Promise<SignedPhotoUrl>;
}
