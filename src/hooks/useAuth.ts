import { createContext, useContext } from 'react';
import type { Session } from '@/types';

export interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login(phone: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  /** Re-reads the session (e.g. to pick up a registration approval). */
  refresh(): Promise<Session | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For screens behind a role guard, where the session is guaranteed. */
export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('useSession called outside an authenticated route');
  return session;
}
