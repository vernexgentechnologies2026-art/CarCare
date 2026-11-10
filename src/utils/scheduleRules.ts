import { RESCHEDULE_WINDOW_DAYS, SCHEDULE_PATTERNS, SCHEDULE_WEEKDAYS } from '@/constants';
import type { ISODate, SchedulePattern } from '@/types';
import { daysBetween, weekdayOf } from './dates';

/** Only the four contracted schedules are valid: Daily, Mon/Wed/Fri, Tue/Fri, Thursday only. */
export function isValidSchedulePattern(value: unknown): value is SchedulePattern {
  return typeof value === 'string' && (SCHEDULE_PATTERNS as readonly string[]).includes(value);
}

export function isScheduledOn(pattern: SchedulePattern, date: ISODate): boolean {
  return SCHEDULE_WEEKDAYS[pattern].includes(weekdayOf(date));
}

/**
 * Validates a reschedule request: the missed wash must be in the past and the
 * new date must fall within the allowed window after today.
 * Returns an error message, or null when valid.
 */
export function validateReschedule(missedDate: ISODate, requestedDate: ISODate, today: ISODate): string | null {
  if (missedDate > today) return 'Only past washes can be rescheduled.';
  if (requestedDate <= today) return 'Pick a date after today.';
  if (daysBetween(today, requestedDate) > RESCHEDULE_WINDOW_DAYS) {
    return `Pick a date within the next ${RESCHEDULE_WINDOW_DAYS} days.`;
  }
  return null;
}
