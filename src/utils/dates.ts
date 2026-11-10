import type { CycleMonth, ISODate } from '@/types';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Formats a Date as a local-time `YYYY-MM-DD` string. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses `YYYY-MM-DD` as local midnight (avoids UTC off-by-one). */
export function parseISODate(value: ISODate): Date {
  const [y, m, d] = value.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y + m + d)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return new Date(y, m - 1, d);
}

export function addDays(value: ISODate, days: number): ISODate {
  const d = parseISODate(value);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(value: ISODate): number {
  return parseISODate(value).getDay();
}

export function cycleOf(value: ISODate): CycleMonth {
  return value.slice(0, 7);
}

export function firstDayOfCycle(cycle: CycleMonth): ISODate {
  return `${cycle}-01`;
}

export function lastDayOfCycle(cycle: CycleMonth): ISODate {
  const [y, m] = cycle.split('-').map(Number);
  if (y === undefined || m === undefined) throw new Error(`Invalid cycle: ${cycle}`);
  return toISODate(new Date(y, m, 0));
}

export function previousCycle(cycle: CycleMonth): CycleMonth {
  const d = parseISODate(firstDayOfCycle(cycle));
  d.setMonth(d.getMonth() - 1);
  return cycleOf(toISODate(d));
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export const todayISO = (): ISODate => toISODate(new Date());
