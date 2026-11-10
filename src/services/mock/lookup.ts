/** Joins and derived views over the mock store. Internal to the mock layer. */
import type { CleanerJob, Customer, ISODate, Vehicle, VehicleDetail, WashPackage, WashRecord, WashStatus } from '@/types';
import { isScheduledOn } from '@/utils/scheduleRules';
import { notFound, type MockContext } from './runtime';

export function customerById(ctx: MockContext, id: string): Customer {
  return ctx.store.data.customers.find((c) => c.id === id) ?? notFound('Customer');
}

export function vehicleById(ctx: MockContext, id: string): Vehicle {
  return ctx.store.data.vehicles.find((v) => v.id === id) ?? notFound('Vehicle');
}

export function packageById(ctx: MockContext, id: string): WashPackage {
  return ctx.store.data.packages.find((p) => p.id === id) ?? notFound('Package');
}

/** Vehicle with package and cleaner. `forCustomer` strips cleaner identity (rule 7). */
export function vehicleDetail(ctx: MockContext, v: Vehicle, forCustomer = false): VehicleDetail {
  const pkg = v.packageId ? (ctx.store.data.packages.find((p) => p.id === v.packageId) ?? null) : null;
  if (forCustomer) return { ...v, cleanerId: null, package: pkg, cleaner: null };
  const c = v.cleanerId ? ctx.store.data.cleaners.find((x) => x.id === v.cleanerId) : undefined;
  return { ...v, package: pkg, cleaner: c ? { id: c.id, name: c.name } : null };
}

export const vehiclePhotoId = (vehicleId: string): string => `car:${vehicleId}`;

/**
 * Status a resident sees for a recorded wash. A missed wash whose reschedule
 * was approved shows as RESCHEDULED — it still never counts (rule 8).
 */
export function displayStatus(ctx: MockContext, record: WashRecord): WashStatus {
  if (record.status !== 'VEHICLE_NOT_PRESENT') return record.status;
  const moved = ctx.store.data.reschedules.some((r) => r.vehicleId === record.vehicleId && r.missedDate === record.scheduledDate && r.status === 'APPROVED');
  return moved ? 'RESCHEDULED' : record.status;
}

function buildJob(ctx: MockContext, v: Vehicle, owner: Customer, pkg: WashPackage, date: ISODate, isReschedule: boolean): CleanerJob {
  const id = `${v.id}_${date}${isReschedule ? '_R' : ''}`;
  const record = ctx.store.recordForJob(id);
  return {
    id,
    date,
    status: record ? record.status : 'PENDING',
    isReschedule,
    vehicle: {
      id: v.id,
      registration: v.registration,
      carSize: v.carSize,
      makeModel: v.makeModel,
      color: v.color,
      parkingSlot: v.parkingSlot,
      timeRestriction: v.timeRestriction,
      instructions: v.instructions,
    },
    vehiclePhotoId: vehiclePhotoId(v.id),
    owner: { id: owner.id, name: owner.name, phone: owner.phone, block: owner.block, flat: owner.flat, address: owner.address },
    packageName: pkg.name,
    schedulePattern: pkg.schedulePattern,
    record,
  };
}

/** All jobs on `date`, optionally restricted to one cleaner. Sorted by block, flat, plate. */
export function jobsForDate(ctx: MockContext, date: ISODate, cleanerId?: string): CleanerJob[] {
  const { customers, vehicles, packages, reschedules } = ctx.store.data;
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const packageMap = new Map(packages.map((p) => [p.id, p]));
  const jobs: CleanerJob[] = [];

  for (const v of vehicles) {
    if (!v.cleanerId || !v.packageId || (cleanerId && v.cleanerId !== cleanerId)) continue;
    const owner = customerMap.get(v.customerId);
    const pkg = packageMap.get(v.packageId);
    if (!owner || !pkg || owner.status !== 'ACTIVE') continue;
    if (isScheduledOn(pkg.schedulePattern, date)) jobs.push(buildJob(ctx, v, owner, pkg, date, false));
  }

  for (const r of reschedules) {
    if (r.status !== 'APPROVED' || r.requestedDate !== date) continue;
    const v = vehicles.find((x) => x.id === r.vehicleId);
    if (!v?.cleanerId || !v.packageId || (cleanerId && v.cleanerId !== cleanerId)) continue;
    const owner = customerMap.get(v.customerId);
    const pkg = packageMap.get(v.packageId);
    if (owner && pkg) jobs.push(buildJob(ctx, v, owner, pkg, date, true));
  }

  return jobs.sort(
    (a, b) => a.owner.block.localeCompare(b.owner.block) || Number(a.owner.flat) - Number(b.owner.flat) || a.vehicle.registration.localeCompare(b.vehicle.registration),
  );
}

/** Parses a job id back into its parts. */
export function parseJobId(jobId: string): { vehicleId: string; date: ISODate; isReschedule: boolean } {
  const m = /^(veh_[A-Za-z0-9]+)_(\d{4}-\d{2}-\d{2})(_R)?$/.exec(jobId);
  if (!m || !m[1] || !m[2]) notFound('Job');
  return { vehicleId: m[1], date: m[2], isReschedule: Boolean(m[3]) };
}
