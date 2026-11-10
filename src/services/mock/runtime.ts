import { DomainError } from '@/utils/errors';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants';
import type { AuditAction, AuditEntityType, ISODate, PageQuery, Paginated, Role, Session } from '@/types';
import type { MockStore } from './store';

/** Newest-first cap on the audit log kept in local storage. */
const AUDIT_LIMIT = 600;

/**
 * Appends an audit entry for the current actor. Phase 5 does this server-side
 * (database trigger / Edge Function) so clients cannot skip or forge entries.
 */
export function audit(
  ctx: MockContext,
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  summary: string,
  actor?: Pick<Session, 'userId' | 'displayName' | 'role'>,
): void {
  const who = actor ?? ctx.store.getSession();
  ctx.store.data.audit.unshift({
    id: ctx.store.nextId('au'),
    at: new Date().toISOString(),
    actorId: who?.userId ?? 'system',
    actorName: who?.displayName ?? 'System',
    actorRole: who?.role ?? 'SYSTEM',
    action,
    entityType,
    entityId,
    summary,
  });
  if (ctx.store.data.audit.length > AUDIT_LIMIT) ctx.store.data.audit.length = AUDIT_LIMIT;
}

export interface LatencyRange {
  min: number;
  max: number;
}

export interface MockContext {
  store: MockStore;
  today: () => ISODate;
  latency: LatencyRange;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps a synchronous mock operation in simulated network latency and returns a
 * deep copy, so callers can never mutate the store by reference.
 */
export async function respond<T>(ctx: MockContext, op: () => T): Promise<T> {
  const { min, max } = ctx.latency;
  if (max > 0) await sleep(min + Math.random() * (max - min));
  const result = op();
  return result === undefined ? result : structuredClone(result);
}

/** Authorisation guard — the mock's stand-in for Supabase RLS. */
export function requireSession(ctx: MockContext, ...roles: Role[]): Session {
  const session = ctx.store.getSession();
  if (!session) throw new DomainError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  if (roles.length > 0 && !roles.includes(session.role)) {
    throw new DomainError('FORBIDDEN', 'You do not have access to this information.');
  }
  return session;
}

/** Customers may only touch their own records; admins may touch any. */
export function assertCustomerAccess(ctx: MockContext, customerId: string): void {
  const s = requireSession(ctx, 'ADMIN', 'CUSTOMER');
  if (s.role === 'CUSTOMER' && s.customerId !== customerId) {
    throw new DomainError('FORBIDDEN', 'You do not have access to this information.');
  }
}

export function notFound(what: string): never {
  throw new DomainError('NOT_FOUND', `${what} not found.`);
}

/** Slices a result set into one page. Limits are clamped to MAX_PAGE_SIZE. */
export function paginate<T>(items: T[], query: PageQuery): Paginated<T> {
  const limit = Math.min(Math.max(1, Math.floor(query.limit) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const lastPage = Math.max(1, Math.ceil(items.length / limit));
  const page = Math.min(Math.max(1, Math.floor(query.page) || 1), lastPage);
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), total: items.length, page, limit, hasMore: start + limit < items.length };
}

/** Residents with a pending or rejected registration may only see their own profile. */
export function requireApprovedCustomer(ctx: MockContext): Session {
  const s = requireSession(ctx, 'CUSTOMER');
  if (s.customerStatus !== 'ACTIVE' && s.customerStatus !== 'PAUSED') {
    throw new DomainError('NOT_APPROVED', 'Your registration is still under review.');
  }
  return s;
}
