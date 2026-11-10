import type { ICleanerService } from '@/services/interfaces';
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
import { pageArgs, toPaginated, type Backend } from './backend';

/** Cleaners read only their own data; admins read every cleaner (enforced in the database). */
export class SupabaseCleanerService implements ICleanerService {
  constructor(private readonly backend: Backend) {}

  async list(query: PageQuery): Promise<Paginated<Cleaner>> {
    return toPaginated(await this.backend.rpc<{ items: Cleaner[]; total: number }>('admin_list_cleaners', pageArgs(query)), query);
  }

  async getWorkload(date: ISODate, query: PageQuery): Promise<Paginated<CleanerWorkload>> {
    const result = await this.backend.rpc<{ items: CleanerWorkload[]; total: number }>('get_cleaner_workload', { p_date: date, ...pageArgs(query) });
    return toPaginated(result, query);
  }

  getMonthSummary(cleanerId: string, cycle: CycleMonth, through: ISODate): Promise<CleanerDaySummary[]> {
    return this.backend.rpc<CleanerDaySummary[]>('get_cleaner_month_summary', { p_cleaner_id: cleanerId, p_cycle: cycle, p_through: through });
  }

  getWeekSchedule(cleanerId: string, from: ISODate, days: number): Promise<WeekScheduleDay[]> {
    return this.backend.rpc<WeekScheduleDay[]>('get_cleaner_week_schedule', { p_cleaner_id: cleanerId, p_from: from, p_days: days });
  }

  async listAssignedCustomers(query: AssignedCustomerQuery): Promise<Paginated<AssignedCustomer>> {
    const result = await this.backend.rpc<{ items: AssignedCustomer[]; total: number }>('list_assigned_customers', {
      p_cleaner_id: query.cleanerId,
      p_search: query.search?.trim() || null,
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }

  async reassign(input: ReassignInput): Promise<{ moved: number }> {
    const moved = await this.backend.rpc<number>('reassign_cleaner_route', {
      p_from_cleaner: input.fromCleanerId,
      p_to_cleaner: input.toCleanerId,
      p_block: input.block,
    });
    return { moved };
  }
}
