import type { CycleMonth, ISODate, ISODateTime } from '@/types';
import { parseISODate } from './dates';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const formatINR = (rupees: number): string => inr.format(rupees);

export const formatDate = (value: ISODate): string =>
  parseISODate(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateShort = (value: ISODate): string =>
  parseISODate(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** Staff-facing only. Customer views must never render times. */
export const formatDateTime = (value: ISODateTime): string =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const formatCycle = (cycle: CycleMonth): string =>
  parseISODate(`${cycle}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** `9876543210` → `+91 98765 43210` */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
