import { LogOut, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';
import { initials } from '@/utils/formatters';
import { Logo } from './Logo';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Sticky top bar for the mobile layouts (navigation lives in the bottom bar). */
export function AppHeader({ subtitle, maxWidth = 'max-w-md' }: { subtitle: string; maxWidth?: string }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-navy-200 bg-white/95 backdrop-blur">
      <div className={cn('mx-auto flex h-14 items-center justify-between gap-3 px-4', maxWidth)}>
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-xs font-medium text-navy-500">{subtitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white" title={session?.displayName} aria-hidden>
            {initials(session?.displayName ?? '')}
          </span>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-navy-500 hover:bg-navy-100 hover:text-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
