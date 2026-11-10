import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { can, type Permission } from './permissions';

/** Hook form of the permission check for the signed-in user. */
export function useCan(permission: Permission): boolean {
  const { session } = useAuth();
  return can(session?.role, permission);
}

/** Renders children only when the signed-in role holds `permission`. */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  return <>{useCan(permission) ? children : fallback}</>;
}
