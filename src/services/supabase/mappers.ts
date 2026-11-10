import type {
  CarSize,
  CustomerStatus,
  CustomerWashEntry,
  InvoiceStatus,
  PaymentStatus,
  RescheduleStatus,
  Role,
  WashStatus,
} from '@/types';
import { DomainError } from '@/utils/errors';

/**
 * Schema-independent adapters between the database's lower_snake enum values
 * and the app's UPPER_SNAKE domain values. Unknown values throw instead of
 * leaking through, so a schema mismatch fails loudly rather than rendering
 * a wrong status.
 */
function enumCodec<T extends string>(name: string, values: readonly T[]) {
  const known = new Set<string>(values);
  return {
    fromDb(value: string): T {
      const upper = value.toUpperCase();
      if (!known.has(upper)) throw new DomainError('SCHEMA_MISMATCH', `Unknown ${name} value "${value}" from the database.`);
      return upper as T;
    },
    toDb(value: T): string {
      return value.toLowerCase();
    },
  };
}

export const carSizeCodec = enumCodec<CarSize>('car size', ['HATCHBACK', 'SEDAN', 'COMPACT_SUV', 'LARGE_SUV']);
export const roleCodec = enumCodec<Role>('role', ['ADMIN', 'CLEANER', 'CUSTOMER']);
export const customerStatusCodec = enumCodec<CustomerStatus>('customer status', ['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'PAUSED']);
export const washStatusCodec = enumCodec<WashStatus>('wash status', [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'VEHICLE_NOT_PRESENT',
  'CANCELLED',
  'FAILED',
  'RESCHEDULED',
]);
export const rescheduleStatusCodec = enumCodec<RescheduleStatus>('reschedule status', ['REQUESTED', 'APPROVED', 'REJECTED']);
export const invoiceStatusCodec = enumCodec<InvoiceStatus>('invoice status', ['PAID', 'DUE', 'OVERDUE']);
export const paymentStatusCodec = enumCodec<PaymentStatus>('payment status', ['SUCCESS', 'FAILED']);

/** Calendar date (YYYY-MM-DD) of a date or timestamp, in India Standard Time. */
export function toIstDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new DomainError('SCHEMA_MISMATCH', `Invalid date "${value}" from the database.`);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/**
 * Rule 7: a resident's gallery entry carries the date only. Whatever the row
 * contains (timestamps, cleaner ids or names), only these three fields survive.
 */
export function toCustomerWashEntry(row: { date: string; status: string; photoId: string | null }): CustomerWashEntry {
  return { date: toIstDate(row.date), status: washStatusCodec.fromDb(row.status), photoId: row.photoId };
}
