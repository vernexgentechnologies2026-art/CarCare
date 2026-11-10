import { describe, expect, it } from 'vitest';
import type { WashRecord, WashStatus } from '@/types';
import { computeProgress, progressIncrement, progressPercent, toCustomerEntry } from '@/utils/washProgressCalculator';

const ALL_STATUSES: WashStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'VEHICLE_NOT_PRESENT', 'CANCELLED', 'FAILED', 'RESCHEDULED'];

describe('wash progress calculator (rule 1)', () => {
  it('increments only for COMPLETED', () => {
    expect(progressIncrement('COMPLETED')).toBe(1);
    for (const s of ALL_STATUSES.filter((x) => x !== 'COMPLETED')) expect(progressIncrement(s), s).toBe(0);
  });

  it('returns zero increment for vehicle_not_present, cancelled and pending', () => {
    expect(progressIncrement('VEHICLE_NOT_PRESENT')).toBe(0);
    expect(progressIncrement('CANCELLED')).toBe(0);
    expect(progressIncrement('PENDING')).toBe(0);
  });

  it('counts only completed washes in the cycle toward the 13-wash milestone', () => {
    const rows = ALL_STATUSES.map((status, i) => ({ scheduledDate: `2026-11-${String(i + 1).padStart(2, '0')}`, status }));
    rows.push({ scheduledDate: '2026-10-31', status: 'COMPLETED' }); // previous cycle
    const p = computeProgress(rows, '2026-11');
    expect(p).toEqual({ cycle: '2026-11', target: 13, completed: 1, vehicleNotPresent: 1, remaining: 12, percent: 8 });
  });

  it('caps at the milestone', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ scheduledDate: `2026-11-${String(i + 1).padStart(2, '0')}`, status: 'COMPLETED' as const }));
    const p = computeProgress(rows, '2026-11');
    expect(p.completed).toBe(15);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
    expect(progressPercent(13, 13)).toBe(100);
  });

  it('a rescheduled miss never counts until the makeup wash completes (rule 8)', () => {
    const rows: Array<{ scheduledDate: string; status: WashStatus }> = [{ scheduledDate: '2026-11-04', status: 'RESCHEDULED' }];
    expect(computeProgress(rows, '2026-11').completed).toBe(0);
    rows.push({ scheduledDate: '2026-11-12', status: 'COMPLETED' });
    expect(computeProgress(rows, '2026-11').completed).toBe(1);
  });

  it('customer entries carry the date only — no time, cleaner or note (rule 7)', () => {
    const record: WashRecord = {
      id: 'wr_1',
      jobId: 'veh_1_2026-11-02',
      vehicleId: 'veh_1',
      cleanerId: 'cl_1',
      scheduledDate: '2026-11-02',
      status: 'COMPLETED',
      recordedAt: '2026-11-02T01:15:00.000Z',
      photoId: 'ph_1',
      note: 'internal',
    };
    expect(toCustomerEntry(record)).toEqual({ date: '2026-11-02', status: 'COMPLETED', photoId: 'ph_1' });
  });
});
