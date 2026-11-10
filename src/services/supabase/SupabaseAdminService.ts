import type { IAdminService } from '@/services/interfaces';
import type { AdminNotification, AuditEntry, AuditQuery, DailyTrendPoint, DashboardStats, ISODate, PageQuery, Paginated } from '@/types';
import { filterArg, pageArgs, toPaginated, type Backend } from './backend';

/** Admin-only summaries; every function re-checks the admin role in the database. */
export class SupabaseAdminService implements IAdminService {
  constructor(private readonly backend: Backend) {}

  getDashboard(date: ISODate): Promise<DashboardStats> {
    return this.backend.rpc<DashboardStats>('get_admin_dashboard', { p_date: date });
  }

  getDailyTrend(to: ISODate, days: number): Promise<DailyTrendPoint[]> {
    return this.backend.rpc<DailyTrendPoint[]>('get_daily_trend', { p_to: to, p_days: days });
  }

  async listNotifications(query: PageQuery): Promise<Paginated<AdminNotification>> {
    return toPaginated(await this.backend.rpc<{ items: AdminNotification[]; total: number }>('list_admin_notifications', pageArgs(query)), query);
  }

  async listAuditLog(query: AuditQuery): Promise<Paginated<AuditEntry>> {
    const result = await this.backend.rpc<{ items: AuditEntry[]; total: number }>('list_audit_log', {
      p_action: filterArg(query.action),
      p_entity: filterArg(query.entityType),
      p_role: filterArg(query.role),
      p_search: query.search?.trim() || null,
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }
}
