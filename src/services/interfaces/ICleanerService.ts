import type {
  AssignedCustomer,
  AssignedCustomerQuery,
  Cleaner,
  CleanerDaySummary,
  CleanerWorkload,
  CycleMonth,
  ISODate,
  PageQuery,
  Paginated,
  ReassignInput,
  WeekScheduleDay,
} from '@/types';

export interface ICleanerService {
  list(query: PageQuery): Promise<Paginated<Cleaner>>;
  /** Roster with route coverage and today's counts (admin). */
  getWorkload(date: ISODate, query: PageQuery): Promise<Paginated<CleanerWorkload>>;
  /** Day-by-day outcomes for one cleaner over a month, up to `through` (Targets screen). */
  getMonthSummary(cleanerId: string, cycle: CycleMonth, through: ISODate): Promise<CleanerDaySummary[]>;
  /** Scheduled vehicle counts per block for `days` days from `from` (fixed-size summary). */
  getWeekSchedule(cleanerId: string, from: ISODate, days: number): Promise<WeekScheduleDay[]>;
  /** Residents whose vehicles are assigned to the cleaner. */
  listAssignedCustomers(query: AssignedCustomerQuery): Promise<Paginated<AssignedCustomer>>;
  /** Moves a cleaner's vehicles (optionally one block) to another cleaner. */
  reassign(input: ReassignInput): Promise<{ moved: number }>;
}
