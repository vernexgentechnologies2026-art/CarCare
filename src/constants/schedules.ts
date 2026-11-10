import type { SchedulePattern } from '@/types';

export const SCHEDULE_PATTERNS: readonly SchedulePattern[] = ['DAILY', 'MON_WED_FRI', 'TUE_FRI', 'THU_ONLY'];

/** Weekdays (0 = Sunday) on which each pattern is serviced. */
export const SCHEDULE_WEEKDAYS: Readonly<Record<SchedulePattern, readonly number[]>> = {
  DAILY: [0, 1, 2, 3, 4, 5, 6],
  MON_WED_FRI: [1, 3, 5],
  TUE_FRI: [2, 5],
  THU_ONLY: [4],
};

export const SCHEDULE_LABEL: Record<SchedulePattern, string> = {
  DAILY: 'Daily',
  MON_WED_FRI: 'Mon · Wed · Fri',
  TUE_FRI: 'Tue · Fri',
  THU_ONLY: 'Thursday only',
};

/** How far ahead a customer may reschedule a missed wash. */
export const RESCHEDULE_WINDOW_DAYS = 14;
