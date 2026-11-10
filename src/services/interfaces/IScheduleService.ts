import type { RescheduleValues } from '@/schemas';
import type { CalendarDay, CustomerRescheduleQuery, CycleMonth, Paginated, RescheduleQuery, RescheduleRequest, RescheduleView } from '@/types';

export interface IScheduleService {
  /** Admin master calendar: per-day scheduled vs recorded counts for a month (fixed-size summary). */
  getMasterCalendar(cycle: CycleMonth, block?: string | 'ALL'): Promise<CalendarDay[]>;
  /** Requesting (or approving) a reschedule never changes wash progress (rule 8). */
  createReschedule(vehicleId: string, input: RescheduleValues): Promise<RescheduleRequest>;
  listReschedulesForCustomer(query: CustomerRescheduleQuery): Promise<Paginated<RescheduleRequest>>;
  listReschedules(query: RescheduleQuery): Promise<Paginated<RescheduleView>>;
  resolveReschedule(requestId: string, decision: 'APPROVED' | 'REJECTED', adminNote: string | null): Promise<void>;
}
