import { rescheduleSchema, type RescheduleValues } from '@/schemas';
import type { IScheduleService } from '@/services/interfaces';
import type { CalendarDay, CustomerRescheduleQuery, CycleMonth, Paginated, RescheduleQuery, RescheduleRequest, RescheduleView } from '@/types';
import { dateRange, firstDayOfCycle, lastDayOfCycle } from '@/utils/dates';
import { DomainError } from '@/utils/errors';
import { formatDate } from '@/utils/formatters';
import { validateReschedule } from '@/utils/scheduleRules';
import { customerById, jobsForDate, vehicleById } from './lookup';
import { assertCustomerAccess, audit, notFound, paginate, requireApprovedCustomer, requireSession, respond, type MockContext } from './runtime';

export class MockScheduleService implements IScheduleService {
  constructor(private readonly ctx: MockContext) {}

  getMasterCalendar(cycle: CycleMonth, block: string | 'ALL' = 'ALL'): Promise<CalendarDay[]> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      return dateRange(firstDayOfCycle(cycle), lastDayOfCycle(cycle)).map((date) => {
        const jobs = jobsForDate(this.ctx, date).filter((j) => block === 'ALL' || j.owner.block === block);
        return {
          date,
          scheduled: jobs.length,
          completed: jobs.filter((j) => j.status === 'COMPLETED').length,
          notPresent: jobs.filter((j) => j.status === 'VEHICLE_NOT_PRESENT').length,
          rescheduled: jobs.filter((j) => j.isReschedule).length,
        };
      });
    });
  }

  /** Rule 8: creates a request only — progress is untouched until the makeup wash is completed with a photo. */
  createReschedule(vehicleId: string, input: RescheduleValues): Promise<RescheduleRequest> {
    return respond(this.ctx, () => {
      requireApprovedCustomer(this.ctx);
      const v = rescheduleSchema.parse(input);
      const vehicle = vehicleById(this.ctx, vehicleId);
      assertCustomerAccess(this.ctx, vehicle.customerId);

      const error = validateReschedule(v.missedDate, v.requestedDate, this.ctx.today());
      if (error) throw new DomainError('INVALID_RESCHEDULE', error);
      const missed = this.ctx.store.recordsForVehicle(vehicleId).find((r) => r.scheduledDate === v.missedDate && r.status === 'VEHICLE_NOT_PRESENT');
      if (!missed) throw new DomainError('NOT_MISSED', 'Only missed washes can be rescheduled.');
      const duplicate = this.ctx.store.data.reschedules.some((r) => r.vehicleId === vehicleId && r.missedDate === v.missedDate && r.status !== 'REJECTED');
      if (duplicate) throw new DomainError('DUPLICATE', 'A reschedule for this wash already exists.');

      const request: RescheduleRequest = {
        id: this.ctx.store.nextId('rs'),
        customerId: vehicle.customerId,
        vehicleId,
        missedDate: v.missedDate,
        requestedDate: v.requestedDate,
        reason: v.reason,
        status: 'REQUESTED',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        adminNote: null,
      };
      this.ctx.store.data.reschedules.push(request);
      audit(this.ctx, 'RESCHEDULE_REQUESTED', 'RESCHEDULE', request.id, `${vehicle.registration}: ${formatDate(v.missedDate)} → ${formatDate(v.requestedDate)}`);
      this.ctx.store.commit();
      return request;
    });
  }

  listReschedulesForCustomer(query: CustomerRescheduleQuery): Promise<Paginated<RescheduleRequest>> {
    return respond(this.ctx, () => {
      assertCustomerAccess(this.ctx, query.customerId);
      const rows = this.ctx.store.data.reschedules
        .filter((r) => r.customerId === query.customerId && (!query.vehicleId || r.vehicleId === query.vehicleId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return paginate(rows, query);
    });
  }

  listReschedules(query: RescheduleQuery): Promise<Paginated<RescheduleView>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const rows = this.ctx.store.data.reschedules
        .filter((r) => query.status === 'ALL' || r.status === query.status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const page = paginate(rows, query);
      return {
        ...page,
        items: page.items.map((r) => {
          const owner = customerById(this.ctx, r.customerId);
          const vehicle = vehicleById(this.ctx, r.vehicleId);
          return { ...r, ownerName: owner.name, registration: vehicle.registration, block: owner.block, flat: owner.flat };
        }),
      };
    });
  }

  resolveReschedule(requestId: string, decision: 'APPROVED' | 'REJECTED', adminNote: string | null): Promise<void> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const request = this.ctx.store.data.reschedules.find((r) => r.id === requestId) ?? notFound('Reschedule request');
      if (request.status !== 'REQUESTED') throw new DomainError('INVALID_STATE', 'This request has already been resolved.');
      if (decision === 'APPROVED' && request.requestedDate <= this.ctx.today()) {
        throw new DomainError('DATE_PASSED', 'The requested date has passed. Ask the resident to pick a new date.');
      }
      if (decision === 'REJECTED' && !adminNote?.trim()) throw new DomainError('NOTE_REQUIRED', 'Add a short note so the resident knows why.');
      request.status = decision;
      request.adminNote = adminNote?.trim() || null;
      request.resolvedAt = new Date().toISOString();
      const owner = customerById(this.ctx, request.customerId);
      audit(
        this.ctx,
        decision === 'APPROVED' ? 'RESCHEDULE_APPROVED' : 'RESCHEDULE_REJECTED',
        'RESCHEDULE',
        request.id,
        `${decision === 'APPROVED' ? 'Approved' : 'Rejected'} reschedule for ${owner.name} to ${formatDate(request.requestedDate)}`,
      );
      this.ctx.store.commit();
    });
  }
}
