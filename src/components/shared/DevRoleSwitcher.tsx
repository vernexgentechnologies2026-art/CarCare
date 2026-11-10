import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Database, Hourglass, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PERSONA_LABEL } from '@/constants';
import { homeFor } from '@/features/auth/permissions';
import { qk } from '@/hooks/queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useServices } from '@/services';
import type { DemoPersona } from '@/types';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

const PERSONA_ICON: Record<DemoPersona, typeof ShieldCheck> = {
  CUSTOMER_APPROVED: UserRound,
  CUSTOMER_PENDING: Hourglass,
  CLEANER: Wrench,
  ADMIN: ShieldCheck,
};

/**
 * VITE_ENABLE_DEV_TOOLS decides explicitly: 'false' always hides the dock (production),
 * 'true' shows it in any build. When unset, it follows `vite dev`.
 * It is also never rendered against a non-mock backend (see `enabled` below).
 */
export const devToolsEnabled = (): boolean => {
  const flag = import.meta.env.VITE_ENABLE_DEV_TOOLS;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return import.meta.env.DEV;
};

/**
 * Floating dock for reviewers: switch instantly between the four personas and
 * reset the mock database. Never rendered for a real (non-mock) backend.
 */
export function DevRoleSwitcher() {
  const services = useServices();
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState<DemoPersona | 'RESET' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const enabled = devToolsEnabled() && services.dataSource === 'mock';

  const { data: accounts = [] } = useQuery({ queryKey: qk.demoAccounts, queryFn: () => services.auth.getDemoAccounts(), staleTime: Infinity, enabled });
  if (!enabled || accounts.length === 0) return null;

  const current = accounts.find((a) => a.phone === session?.phone)?.persona ?? null;

  const switchTo = async (persona: DemoPersona) => {
    const account = accounts.find((a) => a.persona === persona);
    if (!account) return;
    setBusy(persona);
    try {
      const next = await login(account.phone, account.password);
      navigate(homeFor(next), { replace: true });
      toast.info(`Viewing as ${PERSONA_LABEL[persona]}`, account.label);
    } catch (e) {
      toast.error('Could not switch role', getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy('RESET');
    try {
      await services.resetDemoData?.();
      window.location.assign('/login');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div role="region" aria-label="Developer tools" className="pointer-events-none fixed inset-x-0 bottom-16 z-40 flex justify-center px-3 sm:bottom-3">
        <div className="pointer-events-auto max-w-full rounded-2xl bg-navy-900/95 p-1.5 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
          <div className="flex items-center gap-1">
            <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-navy-400 md:inline">Dev</span>
            {!collapsed && (
              <div role="radiogroup" aria-label="Switch persona" className="flex max-w-[calc(100vw-7rem)] gap-1 overflow-x-auto">
                {accounts.map((a) => {
                  const Icon = PERSONA_ICON[a.persona];
                  const active = current === a.persona;
                  return (
                    <button
                      key={a.persona}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={a.label}
                      disabled={busy !== null}
                      onClick={() => void switchTo(a.persona)}
                      className={cn(
                        'flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60',
                        active ? 'bg-white text-navy-900' : 'text-navy-200 hover:bg-navy-800',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      <span className="whitespace-nowrap">{busy === a.persona ? 'Switching…' : PERSONA_LABEL[a.persona]}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  disabled={busy !== null}
                  className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-warning hover:bg-navy-800 disabled:opacity-60"
                >
                  <Database className="h-4 w-4" aria-hidden />
                  <span className="whitespace-nowrap">Reset Mock Database</span>
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand developer tools' : 'Collapse developer tools'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-navy-300 hover:bg-navy-800"
            >
              {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        busy={busy === 'RESET'}
        title="Reset mock database?"
        description="Restores the initial seed data: approvals, washes, payments and uploaded photos made in this browser are discarded, and you are signed out."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)} disabled={busy === 'RESET'}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === 'RESET'} onClick={() => void reset()}>
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-navy-600">The data is re-seeded with today as the anchor date.</p>
      </Modal>
    </>
  );
}
