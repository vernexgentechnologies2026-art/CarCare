import { WASH_TARGET_PER_CYCLE } from '@/constants';
import type { CustomerWashEntry, CycleMonth, WashProgress, WashRecord, WashStatus } from '@/types';
import { cycleOf } from './dates';

/**
 * Business rule 1: ONLY an explicit COMPLETED wash moves the 13-wash milestone.
 * Pending, in-progress, vehicle-not-present, cancelled, failed and rescheduled
 * washes never do — including a missed wash whose reschedule was approved
 * (rule 8); only the executed, photo-verified makeup wash counts.
 */
export function progressIncrement(status: WashStatus): 0 | 1 {
  return status === 'COMPLETED' ? 1 : 0;
}

/** Monthly progress toward the milestone for one vehicle's wash rows. */
export function computeProgress(
  washes: ReadonlyArray<{ scheduledDate: string; status: WashStatus }>,
  cycle: CycleMonth,
  target: number = WASH_TARGET_PER_CYCLE,
): WashProgress {
  let completed = 0;
  let vehicleNotPresent = 0;
  for (const w of washes) {
    if (cycleOf(w.scheduledDate) !== cycle) continue;
    completed += progressIncrement(w.status);
    if (w.status === 'VEHICLE_NOT_PRESENT') vehicleNotPresent += 1;
  }
  const remaining = Math.max(0, target - completed);
  return { cycle, target, completed, vehicleNotPresent, remaining, percent: progressPercent(completed, target) };
}

export function progressPercent(completed: number, target: number): number {
  return target > 0 ? Math.round(Math.min(1, completed / target) * 100) : 0;
}

/** Fraction of the target achieved, clamped to [0, 1]. */
export const progressRatio = (p: Pick<WashProgress, 'completed' | 'target'>): number => (p.target > 0 ? Math.min(1, p.completed / p.target) : 0);

/**
 * Business rule 7: customers see the wash DATE only. The timestamp, cleaner
 * id and notes are dropped here, at the service boundary.
 */
export function toCustomerEntry(record: WashRecord, status: WashStatus = record.status): CustomerWashEntry {
  return { date: record.scheduledDate, status, photoId: record.photoId };
}
