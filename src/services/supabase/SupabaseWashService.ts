import type { IWashService } from '@/services/interfaces';
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
import { DomainError } from '@/utils/errors';
import { NOTE_MAX_LENGTH, photoProblem } from '@/utils/washCompletionRules';
import { filterArg, pageArgs, toPaginated, type Backend } from './backend';
import { toCustomerWashEntry } from './mappers';

export class SupabaseWashService implements IWashService {
  constructor(private readonly backend: Backend) {}

  async getCleanerJobs(query: CleanerJobQuery): Promise<Paginated<CleanerJob>> {
    const result = await this.backend.rpc<{ items: CleanerJob[]; total: number }>('get_cleaner_jobs', {
      p_cleaner_id: query.cleanerId,
      p_date: query.date,
      p_status: filterArg(query.status),
      p_search: query.search?.trim() || null,
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }

  getJobSummary(cleanerId: string, date: ISODate): Promise<JobSummary> {
    return this.backend.rpc<JobSummary>('get_job_summary', { p_cleaner_id: cleanerId, p_date: date });
  }

  getJob(jobId: string): Promise<CleanerJob> {
    return this.backend.rpc<CleanerJob>('get_job', { p_job_id: jobId });
  }

  /**
   * Rule 3: the photo is checked here, again by the gateway (type and 150 KB),
   * and the database refuses `completed` unless the stored photo exists.
   */
  async completeWash(input: CompleteWashInput): Promise<CleanerJob> {
    const problem = photoProblem(input.photo);
    if (problem) throw new DomainError('PHOTO_REQUIRED', problem);
    await this.backend.photos.upload(input.jobId, input.photo);
    await this.backend.rpc('complete_wash', { p_job_id: input.jobId });
    return this.getJob(input.jobId);
  }

  /** Rule 2: audited in the database, final, and never counted. */
  async markVehicleNotPresent(input: NotPresentInput): Promise<CleanerJob> {
    const note = input.note.trim();
    if (note.length > NOTE_MAX_LENGTH) throw new DomainError('INVALID', `Keep the note under ${NOTE_MAX_LENGTH} characters.`);
    await this.backend.rpc('mark_vehicle_not_present', { p_job_id: input.jobId, p_note: note || null });
    return this.getJob(input.jobId);
  }

  /** Rule 7: re-sanitised here too, so only date, status and photo id can reach the UI. */
  async getCustomerHistory(query: CustomerHistoryQuery): Promise<Paginated<CustomerWashEntry>> {
    const result = await this.backend.rpc<{ items: Array<{ date: string; status: string; photoId: string | null }>; total: number }>(
      'get_customer_history',
      {
        p_vehicle_id: query.vehicleId,
        p_cycle: query.cycle ?? null,
        p_status: filterArg(query.status),
        p_photos_only: query.withPhotosOnly ?? false,
        ...pageArgs(query),
      },
    );
    return toPaginated({ items: result.items.map(toCustomerWashEntry), total: result.total }, query);
  }

  /** Monthly roll-ups are not stored yet (planned with the data-lifecycle job); detailed rows cover all history. */
  async getMonthlyRollups(query: RollupQuery): Promise<Paginated<MonthlyWashRollup>> {
    return toPaginated({ items: [], total: 0 }, query);
  }

  async getReschedulableMisses(vehicleId: string, query: PageQuery): Promise<Paginated<ISODate>> {
    const result = await this.backend.rpc<{ items: ISODate[]; total: number }>('get_reschedulable_misses', { p_vehicle_id: vehicleId, ...pageArgs(query) });
    return toPaginated(result, query);
  }

  /** Rule 1: the database counts status = 'completed' only. */
  getProgress(vehicleId: string, cycle: CycleMonth): Promise<WashProgress> {
    return this.backend.rpc<WashProgress>('get_vehicle_progress', { p_vehicle_id: vehicleId, p_cycle: cycle });
  }

  getNextWashDate(vehicleId: string, from: ISODate): Promise<ISODate | null> {
    return this.backend.rpc<ISODate | null>('get_next_wash_date', { p_vehicle_id: vehicleId, p_from: from });
  }

  getWashSummary(query: WashSummaryQuery): Promise<WashSummary> {
    return this.backend.rpc<WashSummary>('get_wash_summary', {
      p_from: query.from,
      p_to: query.to,
      p_cleaner_id: query.cleanerId ?? null,
      p_block: filterArg(query.block),
    });
  }

  async listPhotos(query: PhotoQuery): Promise<Paginated<AdminPhotoEntry>> {
    const result = await this.backend.rpc<{ items: AdminPhotoEntry[]; total: number }>('admin_list_photos', {
      p_from: query.from,
      p_to: query.to,
      p_block: filterArg(query.block),
      p_cleaner: filterArg(query.cleanerId),
      p_search: query.search?.trim() || null,
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }

  /** 15-minute signed URL from the R2 gateway. Vehicle reference photos are not stored in Phase 5. */
  getPhotoUrl(photoId: string): Promise<SignedPhotoUrl> {
    if (photoId.startsWith('car:')) return Promise.reject(new DomainError('NOT_FOUND', 'No reference photo for this vehicle.'));
    return this.backend.photos.viewUrl(photoId);
  }
}
