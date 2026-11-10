import type { Role, Session } from '@/types';

/**
 * Role-based permission switches. The UI uses these to hide actions a role
 * cannot perform; services enforce the same rules independently (RLS in
 * Phase 5), so this map is a convenience, never the security boundary.
 */
export type Permission =
  | 'dashboard:view'
  | 'customers:approve'
  | 'customers:manage'
  | 'cleaners:allocate'
  | 'packages:manage'
  | 'schedules:manage'
  | 'payments:ledger'
  | 'payments:override'
  | 'photos:audit'
  | 'audit:view'
  | 'jobs:record'
  | 'targets:view'
  | 'washes:own'
  | 'reschedules:request'
  | 'billing:pay'
  | 'packages:select';

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  ADMIN: [
    'dashboard:view',
    'customers:approve',
    'customers:manage',
    'cleaners:allocate',
    'packages:manage',
    'schedules:manage',
    'payments:ledger',
    'payments:override',
    'photos:audit',
    'audit:view',
  ],
  CLEANER: ['jobs:record', 'targets:view'],
  CUSTOMER: ['washes:own', 'reschedules:request', 'billing:pay', 'packages:select'],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: '/admin/dashboard',
  CLEANER: '/cleaner/today',
  CUSTOMER: '/customer/dashboard',
};

export const APPROVAL_STATUS_PATH = '/customer/approval-status';

/** Residents whose registration isn't approved yet are held on the status screen. */
export function isApprovedResident(session: Pick<Session, 'role' | 'customerStatus'>): boolean {
  return session.role !== 'CUSTOMER' || session.customerStatus === 'ACTIVE' || session.customerStatus === 'PAUSED';
}

/** Where a signed-in user lands. */
export function homeFor(session: Pick<Session, 'role' | 'customerStatus'>): string {
  return isApprovedResident(session) ? HOME_BY_ROLE[session.role] : APPROVAL_STATUS_PATH;
}
