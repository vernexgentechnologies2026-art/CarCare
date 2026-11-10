import { CalendarClock, Camera, Home, Receipt, UserRound } from 'lucide-react';
import type { NavItem } from '@/components/shared';
import { MobileLayout } from './MobileLayout';

const NAV: NavItem[] = [
  { to: '/customer/dashboard', label: 'Home', icon: Home },
  { to: '/customer/photos', label: 'Photos', icon: Camera },
  { to: '/customer/reschedule', label: 'Reschedule', icon: CalendarClock },
  { to: '/customer/invoices', label: 'Invoices', icon: Receipt },
  { to: '/customer/account', label: 'Account', icon: UserRound },
];

/** Mobile-first; centred at max-w-md on desktop. */
export function CustomerLayout() {
  return <MobileLayout nav={NAV} subtitle="Resident" width="md" />;
}
