import { describe, expect, it } from 'vitest';
import { SCHEDULE_PATTERNS } from '@/constants';
import { schedulePatternSchema } from '@/schemas';
import { isScheduledOn, isValidSchedulePattern, validateReschedule } from '@/utils/scheduleRules';

describe('schedule validation', () => {
  it('accepts exactly the 4 contracted schedules', () => {
    expect([...SCHEDULE_PATTERNS].sort()).toEqual(['DAILY', 'MON_WED_FRI', 'THU_ONLY', 'TUE_FRI']);
    for (const p of SCHEDULE_PATTERNS) expect(isValidSchedulePattern(p)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['WEEKLY', 'SAT_SUN', 'MON_ONLY', 'daily', '', null, undefined, 3]) {
      expect(isValidSchedulePattern(bad), String(bad)).toBe(false);
      expect(schedulePatternSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('maps each schedule to its weekdays', () => {
    // 2026-11-09 is a Monday.
    const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
    const days = (p: (typeof SCHEDULE_PATTERNS)[number]) => week.filter((d) => isScheduledOn(p, d));
    expect(days('DAILY')).toHaveLength(7);
    expect(days('MON_WED_FRI')).toEqual(['2026-11-09', '2026-11-11', '2026-11-13']);
    expect(days('TUE_FRI')).toEqual(['2026-11-10', '2026-11-13']);
    expect(days('THU_ONLY')).toEqual(['2026-11-12']);
  });

  it('validates reschedule windows', () => {
    expect(validateReschedule('2026-11-09', '2026-11-12', '2026-11-10')).toBeNull();
    expect(validateReschedule('2026-11-11', '2026-11-12', '2026-11-10')).toMatch(/past/);
    expect(validateReschedule('2026-11-09', '2026-11-10', '2026-11-10')).toMatch(/after today/);
    expect(validateReschedule('2026-11-09', '2026-12-01', '2026-11-10')).toMatch(/within/);
  });
});
