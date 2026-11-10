import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from '@/hooks/useAuth';
import { qk } from '@/hooks/queryKeys';
import { useServices } from '@/services';
import type { Session } from '@/types';

/** Cached data that isn't tied to a user and survives sign-in changes. */
const USER_INDEPENDENT_KEYS = new Set<string>([qk.session[0], qk.demoAccounts[0]]);

/** Owns the signed-in session and keeps the query cache scoped to it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = useServices();
  const queryClient = useQueryClient();
  const restored = useQuery({ queryKey: qk.session, queryFn: () => auth.getSession(), staleTime: Infinity });

  /**
   * Sign-in / sign-out results are held in React state rather than read back
   * from the query cache. Cache notifications are delivered asynchronously,
   * so a navigation issued right after login could otherwise render the next
   * route with the previous session (e.g. a guard briefly seeing the old role).
   */
  const [changed, setChanged] = useState<{ session: Session | null } | null>(null);
  const session = changed ? changed.session : (restored.data ?? null);

  const applySession = useCallback(
    (next: Session | null) => {
      setChanged({ session: next });
      // Drop every other cached query so one user's data is never shown to the next.
      queryClient.removeQueries({ predicate: (q) => !USER_INDEPENDENT_KEYS.has(String(q.queryKey[0])) });
      queryClient.setQueryData(qk.session, next);
    },
    [queryClient],
  );

  const login = useCallback(
    async (phone: string, password: string) => {
      const next = await auth.login(phone, password);
      applySession(next);
      return next;
    },
    [auth, applySession],
  );

  const logout = useCallback(async () => {
    await auth.logout();
    applySession(null);
  }, [auth, applySession]);

  /** Re-reads the session without clearing other cached data (same user). */
  const refresh = useCallback(async () => {
    const next = await auth.getSession();
    setChanged({ session: next });
    queryClient.setQueryData(qk.session, next);
    return next;
  }, [auth, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading: !changed && restored.isPending, login, logout, refresh }),
    [session, changed, restored.isPending, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
