import { useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/feedback';
import { APPROVAL_STATUS_PATH, can, homeFor, isApprovedResident, type Permission } from '@/features/auth/permissions';
import { useAuth } from '@/hooks/useAuth';
import type { Role } from '@/types';

/**
 * Blocks access unless signed in with one of `roles` (and, optionally, `permission`).
 * Visiting another role's area shows "forbidden"; but if the session itself
 * changes while the user is here (role switch, sign-in from another tab),
 * they are taken to their new home instead.
 */
export function RequireRole({ roles, permission }: { roles: Role[]; permission?: Permission }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  // First signed-in user this guard saw (the session may still be loading at mount).
  const firstUser = useRef<string | null>(null);
  if (loading) return <Spinner label="Checking your session" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  firstUser.current ??= session.userId;
  const allowed = roles.includes(session.role) && (!permission || can(session.role, permission));
  if (!allowed) {
    const switched = firstUser.current !== session.userId;
    return <Navigate to={switched ? homeFor(session) : '/forbidden'} replace />;
  }
  return <Outlet />;
}

/** Holds residents with a pending or rejected registration on the approval-status screen. */
export function RequireApprovedResident() {
  const { session } = useAuth();
  if (session && !isApprovedResident(session)) return <Navigate to={APPROVAL_STATUS_PATH} replace />;
  return <Outlet />;
}

/** Sends signed-in users away from public auth screens. */
export function PublicOnly() {
  const { session, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session" />;
  if (session) return <Navigate to={homeFor(session)} replace />;
  return <Outlet />;
}

export function RoleHomeRedirect() {
  const { session, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session" />;
  return <Navigate to={session ? homeFor(session) : '/login'} replace />;
}
