import type { ISODate, Invoice, InvoiceStatus } from '@/types';

export function invoiceStatusFor(invoice: Pick<Invoice, 'amount' | 'amountPaid' | 'dueOn'>, today: ISODate): InvoiceStatus {
  if (invoice.amountPaid >= invoice.amount) return 'PAID';
  return today > invoice.dueOn ? 'OVERDUE' : 'DUE';
}

export function outstandingBalance(invoices: ReadonlyArray<Pick<Invoice, 'amount' | 'amountPaid'>>): number {
  return invoices.reduce((sum, inv) => sum + Math.max(0, inv.amount - inv.amountPaid), 0);
}

export const amountDue = (invoice: Pick<Invoice, 'amount' | 'amountPaid'>): number => Math.max(0, invoice.amount - invoice.amountPaid);
