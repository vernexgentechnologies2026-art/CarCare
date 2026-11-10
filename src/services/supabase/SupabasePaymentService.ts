import type { IPaymentService } from '@/services/interfaces';
import { invoiceOverrideSchema } from '@/schemas';
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
import { DomainError } from '@/utils/errors';
import { filterArg, pageArgs, toPaginated, type Backend } from './backend';

/** How long to wait for the webhook when Razorpay reports "authorised, not yet captured". */
const CAPTURE_POLLS = 5;
const CAPTURE_POLL_MS = 2000;

export class SupabasePaymentService implements IPaymentService {
  constructor(
    private readonly backend: Backend,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async listInvoices(query: CustomerInvoiceQuery): Promise<Paginated<Invoice>> {
    return toPaginated(await this.backend.rpc<{ items: Invoice[]; total: number }>('list_invoices', { p_customer_id: query.customerId, ...pageArgs(query) }), query);
  }

  getInvoice(invoiceId: string): Promise<Invoice> {
    return this.backend.rpc<Invoice>('get_invoice', { p_invoice_id: invoiceId });
  }

  async listPayments(query: CustomerPaymentQuery): Promise<Paginated<Payment>> {
    return toPaginated(await this.backend.rpc<{ items: Payment[]; total: number }>('list_payments', { p_customer_id: query.customerId, ...pageArgs(query) }), query);
  }

  getAccountSummary(customerId: string): Promise<AccountSummary> {
    return this.backend.rpc<AccountSummary>('get_account_summary', { p_customer_id: customerId });
  }

  /**
   * Razorpay order → Checkout → server-side signature + capture check (Edge
   * Functions). The invoice is credited only by the server; `mockOutcome` is
   * ignored. Resolves with the Payment for success and failure alike.
   */
  async payInvoice(input: PayInvoiceInput): Promise<Payment> {
    const invoice = await this.getInvoice(input.invoiceId);
    if (invoice.status === 'PAID') throw new DomainError('ALREADY_PAID', 'This invoice is already paid.');
    const outcome = await this.backend.checkout.pay(input.invoiceId, input.method);

    if (outcome.kind === 'cancelled' || outcome.kind === 'failed') {
      const reason = outcome.kind === 'cancelled' ? 'Payment was cancelled.' : outcome.reason;
      return this.unpaidResult(invoice, input, reason);
    }
    for (let i = 0; ; i++) {
      const latest = await this.backend.rpc<Payment | null>('get_latest_payment', { p_invoice_id: input.invoiceId });
      if (latest?.status === 'SUCCESS') return latest;
      if (outcome.kind === 'paid' || i >= CAPTURE_POLLS) break;
      await this.sleep(CAPTURE_POLL_MS);
    }
    throw new DomainError('PAYMENT_PENDING', 'Your payment is being confirmed by the bank. Check this invoice again in a few minutes.');
  }

  async listAllInvoices(query: InvoiceQuery): Promise<Paginated<InvoiceView>> {
    const result = await this.backend.rpc<{ items: InvoiceView[]; total: number }>('admin_list_invoices', {
      p_cycle: query.cycle ?? null,
      p_status: filterArg(query.status),
      p_search: query.search?.trim() || null,
      ...pageArgs(query),
    });
    return toPaginated(result, query);
  }

  getCollectionsSummary(cycle: CycleMonth): Promise<CollectionsSummary> {
    return this.backend.rpc<CollectionsSummary>('get_collections_summary', { p_cycle: cycle });
  }

  async overrideInvoiceStatus(input: InvoiceOverrideInput): Promise<Invoice> {
    const v = invoiceOverrideSchema.parse({ status: input.status, note: input.note });
    await this.backend.rpc('override_invoice_status', { p_invoice_id: input.invoiceId, p_status: v.status.toLowerCase(), p_note: v.note });
    return this.getInvoice(input.invoiceId);
  }

  /**
   * A cancelled or declined checkout. Razorpay's own `payment.failed` webhook
   * records declined attempts server-side; this object only reports the
   * outcome to the screen and is never stored as a payment.
   */
  private unpaidResult(invoice: Invoice, input: PayInvoiceInput, reason: string): Payment {
    return {
      id: `attempt-${Date.now()}`,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amount: invoice.amount - invoice.amountPaid,
      method: input.method,
      status: 'FAILED',
      reference: '—',
      createdAt: new Date().toISOString(),
      failureReason: reason,
      simulated: false,
    };
  }
}
