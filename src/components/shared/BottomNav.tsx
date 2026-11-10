import { NavLink } from 'react-router-dom';
import { cn } from '@/utils/cn';
import type { NavItem } from './AppHeader';

/** Thumb-reachable tab bar (≥ 44px targets), centred to the app width on desktop. */
export function BottomNav({ nav, maxWidth = 'max-w-md' }: { nav: NavItem[]; maxWidth?: string }) {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className={cn('mx-auto grid', maxWidth)} style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn('flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-brand' : 'text-navy-500 hover:text-navy-800')}
          >
            <item.icon className="h-5 w-5" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
