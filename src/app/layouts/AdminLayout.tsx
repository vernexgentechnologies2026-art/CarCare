import { useQuery } from '@tanstack/react-query';
import {
  BadgeIndianRupee,
  Bell,
  CalendarDays,
  Camera,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/feedback';
import { Logo, ReviewBanner } from '@/components/shared';
import { can, type Permission } from '@/features/auth/permissions';
import { qk } from '@/hooks/queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { useServices } from '@/services';
import { cn } from '@/utils/cn';
import { formatDateTime, initials } from '@/utils/formatters';

interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  badge?: 'approvals' | 'reschedules';
}

const NAV: AdminNavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
  { to: '/admin/customers', label: 'Customers', icon: Users, permission: 'customers:manage', badge: 'approvals' },
  { to: '/admin/cleaners', label: 'Cleaner allocation', icon: UsersRound, permission: 'cleaners:allocate' },
  { to: '/admin/packages', label: 'Packages & pricing', icon: Package, permission: 'packages:manage' },
  { to: '/admin/schedules', label: 'Schedules', icon: CalendarDays, permission: 'schedules:manage', badge: 'reschedules' },
  { to: '/admin/payments', label: 'Payments ledger', icon: BadgeIndianRupee, permission: 'payments:ledger' },
  { to: '/admin/photos', label: 'Photo audit', icon: Camera, permission: 'photos:audit' },
  { to: '/admin/audit-log', label: 'Activity log', icon: ClipboardList, permission: 'audit:view' },
];

/** Desktop-first admin shell: 240px sidebar (drawer on mobile) + top header with quick stats, notifications and profile. */
export function AdminLayout() {
  const { session, logout } = useAuth();
  const services = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location.pathname]);

  const today = services.today();
  const { data: stats } = useQuery({ queryKey: qk.admin.dashboard(today), queryFn: () => services.admin.getDashboard(today) });
  const badgeCount = { approvals: stats?.pendingApprovals ?? 0, reschedules: stats?.openReschedules ?? 0 };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-navy-300">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo inverted />
        <button type="button" className="rounded p-1 text-navy-400 hover:text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav aria-label="Admin" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.filter((i) => can(session?.role, i.permission)).map((item) => {
          const count = item.badge ? badgeCount[item.badge] : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-navy-800 text-white' : 'hover:bg-navy-800/60 hover:text-white')}
            >
              <item.icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {count > 0 && (
                <span className="rounded-full bg-warning px-1.5 text-xs font-semibold tabular-nums text-navy-900" aria-label={`${count} waiting`}>
                  {count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="min-h-dvh bg-navy-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-900/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="relative h-full w-60 max-w-[85vw]">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <ReviewBanner />
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-navy-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-navy-600 hover:bg-navy-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="lg:hidden">
            <Logo />
          </span>
          {stats && (
            <dl className="hidden items-center gap-5 text-xs md:flex" aria-label="Quick stats">
              <QuickStat label="Today" value={`${stats.completedToday + stats.notPresentToday}/${stats.jobsToday} recorded`} />
              <QuickStat label="Approvals" value={String(stats.pendingApprovals)} href="/admin/customers?tab=pending" />
              <QuickStat label="Reschedules" value={String(stats.openReschedules)} href="/admin/schedules" />
              <QuickStat label="Outstanding" value={String(stats.outstandingInvoices)} href="/admin/payments?status=OVERDUE" />
            </dl>
          )}
          <div className="ml-auto flex items-center gap-1">
            <NotificationsMenu />
            <div className="flex items-center gap-2 border-l border-navy-200 pl-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white" aria-hidden>
                {initials(session?.displayName ?? '')}
              </span>
              <span className="hidden text-sm leading-tight sm:block">
                <span className="block font-medium text-navy-900">{session?.displayName}</span>
                <span className="block text-xs text-navy-500">Administrator</span>
              </span>
              <button type="button" onClick={() => void signOut()} className="rounded-lg p-2 text-navy-500 hover:bg-navy-100 hover:text-navy-800" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function QuickStat({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <>
      <dt className="text-navy-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-navy-900">{value}</dd>
    </>
  );
  return href ? (
    <Link to={href} className="flex gap-1.5 rounded px-1 hover:bg-navy-100">
      {body}
    </Link>
  ) : (
    <div className="flex gap-1.5">{body}</div>
  );
}

function NotificationsMenu() {
  const services = useServices();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const query = { page: 1, limit: 8 };
  const { data } = useQuery({ queryKey: [...qk.admin.notifications, query], queryFn: () => services.admin.listNotifications(query) });
  const count = data?.total ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        className="relative rounded-lg p-2 text-navy-600 hover:bg-navy-100"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-xl ring-1 ring-navy-200">
          <p className="border-b border-navy-100 px-4 py-2.5 text-sm font-semibold text-navy-900">Needs attention</p>
          {data && data.items.length > 0 ? (
            <ul className="max-h-96 divide-y divide-navy-100 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <Link to={n.href} onClick={() => setOpen(false)} className="block px-4 py-2.5 hover:bg-navy-50">
                    <p className="text-sm font-medium text-navy-900">{n.title}</p>
                    <p className="text-xs text-navy-500">{n.detail}</p>
                    {n.kind !== 'OVERDUE' && <p className="mt-0.5 text-[11px] text-navy-400">{formatDateTime(n.at)}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-navy-500">You’re all caught up.</p>
          )}
          {data && data.total > data.items.length && <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-500">+{data.total - data.items.length} more</p>}
        </div>
      )}
    </div>
  );
}
