import type { IScheduleService } from '@/services/interfaces';
import { rescheduleSchema, type RescheduleValues } from '@/schemas';
import type { CalendarDay, CustomerRescheduleQuery, CycleMonth, Paginated, RescheduleQuery, RescheduleRequest, RescheduleView } from '@/types';
import { filterArg, pageArgs, toPaginated, type Backend } from './backend';

export class SupabaseScheduleService implements IScheduleService {
  constructor(private readonly backend: Backend) {}

  getMasterCalendar(cycle: CycleMonth, block: string | 'ALL' = 'ALL'): Promise<CalendarDay[]> {
    return this.backend.rpc<CalendarDay[]>('get_master_calendar', { p_cycle: cycle, p_block: filterArg(block) });
  }

  /** Rule 8: a request (or its approval) never changes wash progress. */
  createReschedule(vehicleId: string, input: RescheduleValues): Promise<RescheduleRequest> {
    const v = rescheduleSchema.parse(input);
    return this.backend.rpc<RescheduleRequest>('request_reschedule_for_date', {
      p_vehicle_id: vehicleId,
      p_missed_date: v.missedDate,
      p_requested_date: v.requestedDate,
      p_reason: v.reason,
    });
  }

  async listReschedulesForCustomer(query: CustomerRescheduleQuery): Promise<Paginated<RescheduleRequest>> {
    const result = await this.backend.rpc<{ items: RescheduleRequest[]; total: number }>('list_customer_reschedules', {
      p_customer_id: query.customerId,
      p_vehicle_id: query.vehicleId ?? null,
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }

  async listReschedules(query: RescheduleQuery): Promise<Paginated<RescheduleView>> {
    const result = await this.backend.rpc<{ items: RescheduleView[]; total: number }>('admin_list_reschedules', {
      p_status: filterArg(query.status),
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }

  async resolveReschedule(requestId: string, decision: 'APPROVED' | 'REJECTED', adminNote: string | null): Promise<void> {
    await this.backend.rpc('resolve_reschedule', { p_request_id: requestId, p_approve: decision === 'APPROVED', p_note: adminNote });
  }
}
