import type { AdminNotification, AuditEntry, AuditQuery, DailyTrendPoint, DashboardStats, ISODate, PageQuery, Paginated } from '@/types';

/** Admin-only operational reporting, notifications and audit trail. */
export interface IAdminService {
  /** Summary aggregation for the dashboard — no raw history is downloaded. */
  getDashboard(date: ISODate): Promise<DashboardStats>;
  getDailyTrend(to: ISODate, days: number): Promise<DailyTrendPoint[]>;
  listNotifications(query: PageQuery): Promise<Paginated<AdminNotification>>;
  listAuditLog(query: AuditQuery): Promise<Paginated<AuditEntry>>;
}
