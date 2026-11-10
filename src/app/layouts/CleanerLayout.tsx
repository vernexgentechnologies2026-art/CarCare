import { CalendarDays, ListChecks, Target, Users } from 'lucide-react';
import type { NavItem } from '@/components/shared';
import { MobileLayout } from './MobileLayout';

const NAV: NavItem[] = [
  { to: '/cleaner/today', label: 'Today', icon: ListChecks },
  { to: '/cleaner/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/cleaner/customers', label: 'Customers', icon: Users },
  { to: '/cleaner/targets', label: 'Targets', icon: Target },
];

export function CleanerLayout() {
  return <MobileLayout nav={NAV} subtitle="Cleaner" width="lg" />;
}
