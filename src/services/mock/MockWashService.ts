import { PHOTO_RETENTION_DAYS, SIGNED_URL_TTL_SECONDS } from '@/constants';
import { carIllustration } from '@/mock-data';
import { notPresentSchema } from '@/schemas';
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
  Vehicle,
  WashOutcome,
  WashProgress,
  WashRecord,
  WashSummary,
  WashSummaryQuery,
} from '@/types';
import { addDays, cycleOf, dateRange, daysBetween } from '@/utils/dates';
import { DomainError } from '@/utils/errors';
import { searchKey } from '@/utils/normalisers';
import { isScheduledOn, validateReschedule } from '@/utils/scheduleRules';
import { assertCanRecordOutcome, assertRecordable, photoProblem } from '@/utils/washCompletionRules';
import { computeProgress, toCustomerEntry } from '@/utils/washProgressCalculator';
import { customerById, displayStatus, jobsForDate, packageById, parseJobId, vehicleById } from './lookup';
import { assertCustomerAccess, audit, paginate, requireSession, respond, type MockContext } from './runtime';

const MAX_SUMMARY_DAYS = 62;

export class MockWashService implements IWashService {
  constructor(private readonly ctx: MockContext) {}

  getCleanerJobs(query: CleanerJobQuery): Promise<Paginated<CleanerJob>> {
    return respond(this.ctx, () => {
      this.assertCleanerScope(query.cleanerId);
      const term = query.search ? searchKey(query.search.trim()) : '';
      const rows = jobsForDate(this.ctx, query.date, query.cleanerId).filter(
        (j) =>
          (!query.status || query.status === 'ALL' || j.status === query.status) &&
          (!term || searchKey(`${j.vehicle.registration}|${j.owner.name}|${j.owner.block}${j.owner.flat}`).includes(term)),
      );
      return paginate(rows, query);
    });
  }

  getJobSummary(cleanerId: string, date: ISODate): Promise<JobSummary> {
    return respond(this.ctx, () => {
      this.assertCleanerScope(cleanerId);
      const jobs = jobsForDate(this.ctx, date, cleanerId);
      const count = (s: string) => jobs.filter((j) => j.status === s).length;
      return { date, total: jobs.length, pending: count('PENDING'), completed: count('COMPLETED'), vehicleNotPresent: count('VEHICLE_NOT_PRESENT') };
    });
  }

  getJob(jobId: string): Promise<CleanerJob> {
    return respond(this.ctx, () => this.findJob(jobId));
  }

  async completeWash(input: CompleteWashInput): Promise<CleanerJob> {
    // Validate everything before touching storage.
    const job = this.findJob(input.jobId);
    assertRecordable(job, this.ctx.today());
    const problem = photoProblem(input.photo);
    if (problem) throw new DomainError('PHOTO_REQUIRED', problem);

    const photoId = this.ctx.store.nextId('ph');
    try {
      await this.ctx.store.photos.put(photoId, input.photo);
    } catch {
      throw new DomainError('STORAGE_FULL', 'Could not save the photo on this device. Free up space and try again.');
    }
    return respond(this.ctx, () => {
      const fresh = this.findJob(input.jobId);
      assertRecordable(fresh, this.ctx.today());
      this.record(fresh, 'COMPLETED', photoId, null, input.photo);
      return this.findJob(input.jobId);
    });
  }

  markVehicleNotPresent(input: NotPresentInput): Promise<CleanerJob> {
    return respond(this.ctx, () => {
      const { note } = notPresentSchema.parse({ note: input.note });
      const job = this.findJob(input.jobId);
      assertRecordable(job, this.ctx.today());
      this.record(job, 'VEHICLE_NOT_PRESENT', null, note || null, null);
      return this.findJob(input.jobId);
    });
  }

  getCustomerHistory(query: CustomerHistoryQuery): Promise<Paginated<CustomerWashEntry>> {
    return respond(this.ctx, () => {
      this.assertVehicleAccess(query.vehicleId);
      const rows = this.ctx.store
        .recordsForVehicle(query.vehicleId)
        .filter((r) => (!query.cycle || cycleOf(r.scheduledDate) === query.cycle) && (!query.withPhotosOnly || r.photoId))
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))
        .map((r) => toCustomerEntry(r, displayStatus(this.ctx, r)))
        .filter((e) => !query.status || query.status === 'ALL' || e.status === query.status);
      return paginate(rows, query);
    });
  }

  getMonthlyRollups(query: RollupQuery): Promise<Paginated<MonthlyWashRollup>> {
    return respond(this.ctx, () => {
      this.assertVehicleAccess(query.vehicleId);
      const rows = this.ctx.store.data.rollups.filter((r) => r.vehicleId === query.vehicleId).sort((a, b) => b.cycle.localeCompare(a.cycle));
      return paginate(rows, query);
    });
  }

  getReschedulableMisses(vehicleId: string, query: PageQuery): Promise<Paginated<ISODate>> {
    return respond(this.ctx, () => {
      this.assertVehicleAccess(vehicleId);
      const today = this.ctx.today();
      const taken = new Set(this.ctx.store.data.reschedules.filter((r) => r.vehicleId === vehicleId && r.status !== 'REJECTED').map((r) => r.missedDate));
      const dates = this.ctx.store
        .recordsForVehicle(vehicleId)
        .filter((r) => r.status === 'VEHICLE_NOT_PRESENT' && !taken.has(r.scheduledDate) && daysBetween(r.scheduledDate, today) <= 30)
        .filter((r) => validateReschedule(r.scheduledDate, addDays(today, 1), today) === null)
        .map((r) => r.scheduledDate)
        .sort((a, b) => b.localeCompare(a));
      return paginate(dates, query);
    });
  }

  getProgress(vehicleId: string, cycle: CycleMonth): Promise<WashProgress> {
    return respond(this.ctx, () => {
      this.assertVehicleAccess(vehicleId);
      return computeProgress(this.ctx.store.recordsForVehicle(vehicleId), cycle);
    });
  }

  getNextWashDate(vehicleId: string, from: ISODate): Promise<ISODate | null> {
    return respond(this.ctx, () => {
      const vehicle = this.assertVehicleAccess(vehicleId);
      const owner = customerById(this.ctx, vehicle.customerId);
      if (owner.status !== 'ACTIVE' || !vehicle.cleanerId || !vehicle.packageId) return null;
      const pattern = packageById(this.ctx, vehicle.packageId).schedulePattern;
      const extra = new Set(this.ctx.store.data.reschedules.filter((r) => r.vehicleId === vehicleId && r.status === 'APPROVED').map((r) => r.requestedDate));
      for (let i = 0; i <= 14; i++) {
        const d = addDays(from, i);
        const scheduled = isScheduledOn(pattern, d) && !this.ctx.store.recordForJob(`${vehicleId}_${d}`);
        const rescheduled = extra.has(d) && !this.ctx.store.recordForJob(`${vehicleId}_${d}_R`);
        if (scheduled || rescheduled) return d;
      }
      return null;
    });
  }

  getWashSummary(query: WashSummaryQuery): Promise<WashSummary> {
    return respond(this.ctx, () => {
      const s = requireSession(this.ctx, 'ADMIN', 'CLEANER');
      if (s.role === 'CLEANER' && query.cleanerId !== s.cleanerId) throw new DomainError('FORBIDDEN', 'You do not have access to this information.');
      if (daysBetween(query.from, query.to) > MAX_SUMMARY_DAYS) throw new DomainError('RANGE_TOO_LARGE', `Summaries cover at most ${MAX_SUMMARY_DAYS} days.`);
      const today = this.ctx.today();
      let scheduled = 0;
      let completed = 0;
      let vehicleNotPresent = 0;
      let pending = 0;
      let due = 0;
      for (const date of dateRange(query.from, query.to)) {
        for (const j of jobsForDate(this.ctx, date, query.cleanerId)) {
          if (query.block && query.block !== 'ALL' && j.owner.block !== query.block) continue;
          scheduled += 1;
          if (j.status === 'COMPLETED') completed += 1;
          else if (j.status === 'VEHICLE_NOT_PRESENT') vehicleNotPresent += 1;
          else pending += 1;
          if (date < today || j.status !== 'PENDING') due += 1;
        }
      }
      return { from: query.from, to: query.to, scheduled, completed, vehicleNotPresent, pending, completionRate: due ? Math.round((completed / due) * 100) : 0 };
    });
  }

  listPhotos(query: PhotoQuery): Promise<Paginated<AdminPhotoEntry>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const retentionStart = addDays(this.ctx.today(), -PHOTO_RETENTION_DAYS);
      const from = query.from < retentionStart ? retentionStart : query.from;
      const { vehicles, customers, cleaners } = this.ctx.store.data;
      const vMap = new Map(vehicles.map((v) => [v.id, v]));
      const cMap = new Map(customers.map((c) => [c.id, c]));
      const clMap = new Map(cleaners.map((c) => [c.id, c]));
      const term = query.search ? searchKey(query.search.trim()) : '';
      const rows: AdminPhotoEntry[] = [];
      for (const r of this.ctx.store.data.washRecords) {
        if (r.status !== 'COMPLETED' || !r.photoId || r.scheduledDate < from || r.scheduledDate > query.to) continue;
        if (query.cleanerId && query.cleanerId !== 'ALL' && r.cleanerId !== query.cleanerId) continue;
        const v = vMap.get(r.vehicleId);
        const owner = v ? cMap.get(v.customerId) : undefined;
        if (!v || !owner) continue;
        if (query.block && query.block !== 'ALL' && owner.block !== query.block) continue;
        if (term && !searchKey(`${v.registration}|${owner.name}|${owner.block}${owner.flat}`).includes(term)) continue;
        rows.push({
          photoId: r.photoId,
          date: r.scheduledDate,
          recordedAt: r.recordedAt,
          registration: v.registration,
          ownerName: owner.name,
          block: owner.block,
          flat: owner.flat,
          cleanerId: r.cleanerId,
          cleanerName: clMap.get(r.cleanerId)?.name ?? '—',
        });
      }
      rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      return paginate(rows, query);
    });
  }

  async getPhotoUrl(photoId: string): Promise<SignedPhotoUrl> {
    // Access checks + resolution happen inside respond(); uploaded blobs are fetched from the vault after.
    const resolved = await respond({ ...this.ctx, latency: { min: 40, max: 90 } }, () => this.resolvePhoto(photoId));
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
    if (resolved.kind === 'illustration') return { url: resolved.url, expiresAt };
    const url = await this.ctx.store.photos.url(photoId);
    if (url) return { url, expiresAt };
    // Seeded or cleared photo: fall back to an illustration so the UI stays usable.
    return { url: carIllustration(resolved.color, resolved.registration, true, photoId), expiresAt };
  }

  /* -------------------------------------------------------------- helpers */

  private resolvePhoto(photoId: string): { kind: 'illustration'; url: string } | { kind: 'stored'; color: string; registration: string } {
    const session = requireSession(this.ctx);
    if (photoId.startsWith('car:')) {
      const vehicle = vehicleById(this.ctx, photoId.slice(4));
      if (session.role === 'CUSTOMER') this.assertVehicleAccess(vehicle.id);
      if (session.role === 'CLEANER' && vehicle.cleanerId !== session.cleanerId) this.forbidden();
      return { kind: 'illustration', url: carIllustration(vehicle.color, vehicle.registration, false, photoId) };
    }
    const record = this.ctx.store.data.washRecords.find((r) => r.photoId === photoId);
    if (!record) throw new DomainError('NOT_FOUND', 'Photo not found.');
    if (record.scheduledDate < addDays(this.ctx.today(), -PHOTO_RETENTION_DAYS)) throw new DomainError('EXPIRED', 'This photo is past the retention period.');
    if (session.role === 'CUSTOMER') this.assertVehicleAccess(record.vehicleId);
    if (session.role === 'CLEANER' && record.cleanerId !== session.cleanerId) this.forbidden();
    const vehicle = vehicleById(this.ctx, record.vehicleId);
    if (photoId.startsWith('seed:')) return { kind: 'illustration', url: carIllustration(vehicle.color, vehicle.registration, true, photoId) };
    return { kind: 'stored', color: vehicle.color, registration: vehicle.registration };
  }

  private forbidden(): never {
    throw new DomainError('FORBIDDEN', 'You do not have access to this information.');
  }

  /** Rule 5: cleaners see only their own jobs. */
  private assertCleanerScope(cleanerId: string): void {
    const s = requireSession(this.ctx, 'ADMIN', 'CLEANER');
    if (s.role === 'CLEANER' && s.cleanerId !== cleanerId) this.forbidden();
  }

  /** Rule 4: residents see only their own vehicles. */
  private assertVehicleAccess(vehicleId: string): Vehicle {
    const vehicle = vehicleById(this.ctx, vehicleId);
    assertCustomerAccess(this.ctx, vehicle.customerId);
    return vehicle;
  }

  private findJob(jobId: string): CleanerJob {
    const session = requireSession(this.ctx, 'ADMIN', 'CLEANER');
    const { vehicleId, date } = parseJobId(jobId);
    const vehicle = vehicleById(this.ctx, vehicleId);
    const job = jobsForDate(this.ctx, date, vehicle.cleanerId ?? undefined).find((j) => j.id === jobId);
    if (!job) throw new DomainError('NOT_FOUND', 'This job is not on the schedule.');
    if (session.role === 'CLEANER' && (job.record?.cleanerId ?? vehicle.cleanerId) !== session.cleanerId) this.forbidden();
    return job;
  }

  private record(job: CleanerJob, status: WashOutcome, photoId: string | null, note: string | null, photo: Blob | null): void {
    assertCanRecordOutcome(status, photo, note);
    const vehicle = vehicleById(this.ctx, job.vehicle.id);
    const session = requireSession(this.ctx);
    const record: WashRecord = {
      id: this.ctx.store.nextId('wr'),
      jobId: job.id,
      vehicleId: job.vehicle.id,
      cleanerId: session.cleanerId ?? vehicle.cleanerId ?? 'admin',
      scheduledDate: job.date,
      status,
      recordedAt: new Date().toISOString(),
      photoId,
      note,
    };
    this.ctx.store.addRecord(record);
    audit(
      this.ctx,
      status === 'COMPLETED' ? 'WASH_COMPLETED' : 'VEHICLE_NOT_PRESENT',
      'WASH',
      record.id,
      status === 'COMPLETED'
        ? `${job.vehicle.registration} washed (${job.owner.block}-${job.owner.flat}), photo attached${photo ? ` (${Math.round(photo.size / 1024)} KB)` : ''}${job.isReschedule ? ' — makeup wash' : ''}`
        : `${job.vehicle.registration} not present (${job.owner.block}-${job.owner.flat})${note ? `: ${note}` : ''} — needs manager review`,
    );
    this.ctx.store.commit();
  }
}
