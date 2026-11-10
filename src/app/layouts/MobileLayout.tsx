import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/feedback';
import { AppHeader, BottomNav, ReviewBanner, type NavItem } from '@/components/shared';
import { cn } from '@/utils/cn';

/** Phone-first frame shared by the resident and cleaner layouts. */
export function MobileLayout({ nav, subtitle, width = 'md' }: { nav: NavItem[]; subtitle: string; width?: 'md' | 'lg' }) {
  const location = useLocation();
  const max = width === 'md' ? 'max-w-md' : 'max-w-2xl';
  return (
    <div className="flex min-h-dvh flex-col bg-navy-50">
      <ReviewBanner />
      <AppHeader subtitle={subtitle} maxWidth={max} />
      <main className={cn('mx-auto w-full flex-1 px-4 pb-36 pt-4 sm:pb-24', max)}>
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <BottomNav nav={nav} maxWidth={max} />
    </div>
  );
}
