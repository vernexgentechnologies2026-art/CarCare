import { BLOCKS } from '@/constants';
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
import { addDays, dateRange, firstDayOfCycle, lastDayOfCycle } from '@/utils/dates';
import { DomainError } from '@/utils/errors';
import { searchKey } from '@/utils/normalisers';
import { jobsForDate } from './lookup';
import { audit, paginate, requireSession, respond, type MockContext } from './runtime';

const emptyBlocks = (): Record<string, number> => Object.fromEntries(BLOCKS.map((b) => [b, 0]));

export class MockCleanerService implements ICleanerService {
  constructor(private readonly ctx: MockContext) {}

  list(query: PageQuery): Promise<Paginated<Cleaner>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      return paginate(this.ctx.store.data.cleaners, query);
    });
  }

  getWorkload(date: ISODate, query: PageQuery): Promise<Paginated<CleanerWorkload>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const { customers, vehicles, cleaners } = this.ctx.store.data;
      const blockOf = new Map(customers.filter((c) => c.status === 'ACTIVE').map((c) => [c.id, c.block]));
      const assignedTo = new Map(vehicles.map((v) => [v.id, v.cleanerId]));
      const stats = new Map<string, Omit<CleanerWorkload, 'cleaner'>>(
        cleaners.map((c) => [c.id, { assignedVehicles: 0, vehiclesByBlock: emptyBlocks(), jobsToday: 0, completedToday: 0, notPresentToday: 0 }]),
      );
      for (const v of vehicles) {
        const block = blockOf.get(v.customerId);
        const s = v.cleanerId ? stats.get(v.cleanerId) : undefined;
        if (!block || !s) continue;
        s.assignedVehicles += 1;
        s.vehiclesByBlock[block] = (s.vehiclesByBlock[block] ?? 0) + 1;
      }
      for (const job of jobsForDate(this.ctx, date)) {
        const owner = job.record?.cleanerId ?? assignedTo.get(job.vehicle.id);
        const s = owner ? stats.get(owner) : undefined;
        if (!s) continue;
        s.jobsToday += 1;
        if (job.status === 'COMPLETED') s.completedToday += 1;
        if (job.status === 'VEHICLE_NOT_PRESENT') s.notPresentToday += 1;
      }
      const rows = cleaners.map((cleaner) => ({ cleaner, ...(stats.get(cleaner.id) ?? { assignedVehicles: 0, vehiclesByBlock: emptyBlocks(), jobsToday: 0, completedToday: 0, notPresentToday: 0 }) }));
      return paginate(rows, query);
    });
  }

  getMonthSummary(cleanerId: string, cycle: CycleMonth, through: ISODate): Promise<CleanerDaySummary[]> {
    return respond(this.ctx, () => {
      this.assertSelfOrAdmin(cleanerId);
      const last = lastDayOfCycle(cycle) < through ? lastDayOfCycle(cycle) : through;
      return dateRange(firstDayOfCycle(cycle), last).map((date) => {
        const jobs = jobsForDate(this.ctx, date, cleanerId);
        return {
          date,
          scheduled: jobs.length,
          completed: jobs.filter((j) => j.status === 'COMPLETED').length,
          notPresent: jobs.filter((j) => j.status === 'VEHICLE_NOT_PRESENT').length,
        };
      });
    });
  }

  getWeekSchedule(cleanerId: string, from: ISODate, days: number): Promise<WeekScheduleDay[]> {
    return respond(this.ctx, () => {
      this.assertSelfOrAdmin(cleanerId);
      const span = Math.min(Math.max(1, days), 14);
      return dateRange(from, addDays(from, span - 1)).map((date) => {
        const byBlock = emptyBlocks();
        const jobs = jobsForDate(this.ctx, date, cleanerId);
        for (const j of jobs) byBlock[j.owner.block] = (byBlock[j.owner.block] ?? 0) + 1;
        return { date, total: jobs.length, byBlock };
      });
    });
  }

  listAssignedCustomers(query: AssignedCustomerQuery): Promise<Paginated<AssignedCustomer>> {
    return respond(this.ctx, () => {
      this.assertSelfOrAdmin(query.cleanerId);
      const { customers, vehicles, packages } = this.ctx.store.data;
      const patternOf = new Map(packages.map((p) => [p.id, p.schedulePattern]));
      const mine = vehicles.filter((v) => v.cleanerId === query.cleanerId);
      const byCustomer = new Map<string, typeof mine>();
      for (const v of mine) byCustomer.set(v.customerId, [...(byCustomer.get(v.customerId) ?? []), v]);
      const term = query.search ? searchKey(query.search.trim()) : '';
      const rows: AssignedCustomer[] = [];
      for (const c of customers) {
        const vs = byCustomer.get(c.id);
        if (!vs || c.status !== 'ACTIVE') continue;
        if (term && !searchKey([c.name, `${c.block}${c.flat}`, ...vs.map((v) => v.registration)].join('|')).includes(term)) continue;
        rows.push({
          customerId: c.id,
          name: c.name,
          phone: c.phone,
          block: c.block,
          flat: c.flat,
          vehicles: vs.map((v) => ({ id: v.id, registration: v.registration, makeModel: v.makeModel, parkingSlot: v.parkingSlot, schedulePattern: v.packageId ? (patternOf.get(v.packageId) ?? null) : null })),
        });
      }
      rows.sort((a, b) => a.block.localeCompare(b.block) || Number(a.flat) - Number(b.flat));
      return paginate(rows, query);
    });
  }

  reassign(input: ReassignInput): Promise<{ moved: number }> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const { cleaners, vehicles, customers } = this.ctx.store.data;
      const from = cleaners.find((c) => c.id === input.fromCleanerId);
      const to = cleaners.find((c) => c.id === input.toCleanerId);
      if (!from || !to?.active) throw new DomainError('INVALID_CLEANER', 'Select two active cleaners.');
      if (from.id === to.id) throw new DomainError('SAME_CLEANER', 'Choose a different cleaner.');
      const blockOf = new Map(customers.map((c) => [c.id, c.block]));
      let moved = 0;
      for (const v of vehicles) {
        if (v.cleanerId !== from.id) continue;
        if (input.block !== 'ALL' && blockOf.get(v.customerId) !== input.block) continue;
        v.cleanerId = to.id;
        moved += 1;
      }
      if (moved === 0) throw new DomainError('NOTHING_TO_MOVE', `${from.name} has no vehicles${input.block === 'ALL' ? '' : ` in Block ${input.block}`}.`);
      if (input.block !== 'ALL' && !to.assignedBlocks.includes(input.block)) to.assignedBlocks = [...to.assignedBlocks, input.block].sort();
      audit(this.ctx, 'CLEANER_REASSIGNED', 'CLEANER', to.id, `Moved ${moved} vehicle${moved > 1 ? 's' : ''}${input.block === 'ALL' ? '' : ` in Block ${input.block}`} from ${from.name} to ${to.name}`);
      this.ctx.store.commit();
      return { moved };
    });
  }

  private assertSelfOrAdmin(cleanerId: string): void {
    const s = requireSession(this.ctx, 'ADMIN', 'CLEANER');
    if (s.role === 'CLEANER' && s.cleanerId !== cleanerId) throw new DomainError('FORBIDDEN', 'You do not have access to this information.');
  }
}
