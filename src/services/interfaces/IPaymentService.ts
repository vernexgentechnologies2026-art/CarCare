import type {
  AccountSummary,
  CollectionsSummary,
  CustomerInvoiceQuery,
  CustomerPaymentQuery,
  CycleMonth,
  Invoice,
  InvoiceOverrideInput,
  InvoiceQuery,
  InvoiceView,
  Paginated,
  PayInvoiceInput,
  Payment,
} from '@/types';

export interface IPaymentService {
  listInvoices(query: CustomerInvoiceQuery): Promise<Paginated<Invoice>>;
  getInvoice(invoiceId: string): Promise<Invoice>;
  listPayments(query: CustomerPaymentQuery): Promise<Paginated<Payment>>;
  getAccountSummary(customerId: string): Promise<AccountSummary>;
  /**
   * Runs checkout. Phase 1 is a simulated gateway (every Payment is marked
   * `simulated`); Phase 5 runs Razorpay order → checkout → signature check.
   * Resolves with the Payment for both success and failure.
   */
  payInvoice(input: PayInvoiceInput): Promise<Payment>;
  listAllInvoices(query: InvoiceQuery): Promise<Paginated<InvoiceView>>;
  getCollectionsSummary(cycle: CycleMonth): Promise<CollectionsSummary>;
  /** Admin manual status change (e.g. cash received at the office). Audited. */
  overrideInvoiceStatus(input: InvoiceOverrideInput): Promise<Invoice>;
}
