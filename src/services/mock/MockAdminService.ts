import type { IAdminService } from '@/services/interfaces';
import type { AdminNotification, AuditEntry, AuditQuery, DailyTrendPoint, DashboardStats, ISODate, PageQuery, Paginated } from '@/types';
import { addDays } from '@/utils/dates';
import { formatINR } from '@/utils/formatters';
import { invoiceStatusFor } from '@/utils/invoiceCalculator';
import { searchKey } from '@/utils/normalisers';
import { jobsForDate } from './lookup';
import { paginate, requireSession, respond, type MockContext } from './runtime';

export class MockAdminService implements IAdminService {
  constructor(private readonly ctx: MockContext) {}

  getDashboard(date: ISODate): Promise<DashboardStats> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const { customers, vehicles, reschedules, cleaners, invoices } = this.ctx.store.data;
      const active = new Set(customers.filter((c) => c.status === 'ACTIVE').map((c) => c.id));
      const jobs = jobsForDate(this.ctx, date);
      const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
      const notPresent = jobs.filter((j) => j.status === 'VEHICLE_NOT_PRESENT').length;
      // Completion rate over the previous 7 full days.
      let scheduled7 = 0;
      let completed7 = 0;
      for (let i = 1; i <= 7; i++) {
        const day = jobsForDate(this.ctx, addDays(date, -i));
        scheduled7 += day.length;
        completed7 += day.filter((j) => j.status === 'COMPLETED').length;
      }
      const unpaid = invoices.filter((i) => invoiceStatusFor(i, date) !== 'PAID');
      return {
        date,
        totalCustomers: customers.filter((c) => c.status === 'ACTIVE' || c.status === 'PAUSED').length,
        activeVehicles: vehicles.filter((v) => active.has(v.customerId) && v.packageId).length,
        cleanersActive: cleaners.filter((c) => c.active).length,
        pendingApprovals: customers.filter((c) => c.status === 'PENDING_APPROVAL').length,
        openReschedules: reschedules.filter((r) => r.status === 'REQUESTED').length,
        jobsToday: jobs.length,
        completedToday: completed,
        notPresentToday: notPresent,
        pendingToday: jobs.length - completed - notPresent,
        completionRate: scheduled7 ? Math.round((completed7 / scheduled7) * 100) : 0,
        outstandingInvoices: unpaid.length,
        outstandingAmount: unpaid.reduce((s, i) => s + i.amount - i.amountPaid, 0),
      };
    });
  }

  getDailyTrend(to: ISODate, days: number): Promise<DailyTrendPoint[]> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const points: DailyTrendPoint[] = [];
      for (let i = Math.min(days, 31) - 1; i >= 0; i--) {
        const date = addDays(to, -i);
        const jobs = jobsForDate(this.ctx, date);
        points.push({ date, scheduled: jobs.length, completed: jobs.filter((j) => j.status === 'COMPLETED').length, notPresent: jobs.filter((j) => j.status === 'VEHICLE_NOT_PRESENT').length });
      }
      return points;
    });
  }

  listNotifications(query: PageQuery): Promise<Paginated<AdminNotification>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const today = this.ctx.today();
      const { customers, reschedules, invoices } = this.ctx.store.data;
      const nameOf = new Map(customers.map((c) => [c.id, c]));
      const items: AdminNotification[] = [];
      for (const c of customers.filter((x) => x.status === 'PENDING_APPROVAL')) {
        items.push({ id: `n_ap_${c.id}`, kind: 'APPROVAL', title: 'Registration awaiting approval', detail: `${c.name} · ${c.block}-${c.flat}`, href: '/admin/customers?tab=pending', at: c.createdAt });
      }
      for (const r of reschedules.filter((x) => x.status === 'REQUESTED')) {
        const c = nameOf.get(r.customerId);
        items.push({ id: `n_rs_${r.id}`, kind: 'RESCHEDULE', title: 'Reschedule request', detail: `${c?.name ?? 'Resident'} · ${r.missedDate} → ${r.requestedDate}`, href: '/admin/schedules', at: r.createdAt });
      }
      const overdue = invoices.filter((i) => invoiceStatusFor(i, today) === 'OVERDUE');
      if (overdue.length) {
        const amount = overdue.reduce((s, i) => s + i.amount - i.amountPaid, 0);
        items.push({ id: 'n_overdue', kind: 'OVERDUE', title: `${overdue.length} overdue invoices`, detail: `${formatINR(amount)} outstanding past the due date`, href: '/admin/payments?status=OVERDUE', at: new Date().toISOString() });
      }
      items.sort((a, b) => b.at.localeCompare(a.at));
      return paginate(items, query);
    });
  }

  listAuditLog(query: AuditQuery): Promise<Paginated<AuditEntry>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const term = query.search ? searchKey(query.search) : '';
      const rows = this.ctx.store.data.audit.filter(
        (e) =>
          (!query.action || query.action === 'ALL' || e.action === query.action) &&
          (!query.entityType || query.entityType === 'ALL' || e.entityType === query.entityType) &&
          (!query.role || query.role === 'ALL' || e.actorRole === query.role) &&
          (!term || searchKey(`${e.actorName}|${e.summary}|${e.entityId}`).includes(term)),
      );
      return paginate(rows, query);
    });
  }
}
