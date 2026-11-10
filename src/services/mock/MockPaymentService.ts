import { invoiceOverrideSchema, paymentSchema } from '@/schemas';
import type { IPaymentService } from '@/services/interfaces';
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
import { invoiceStatusFor, outstandingBalance } from '@/utils/invoiceCalculator';
import { searchKey } from '@/utils/normalisers';
import { assertCustomerAccess, audit, notFound, paginate, requireApprovedCustomer, requireSession, respond, type MockContext } from './runtime';

/** Kept for API compatibility: this UPI handle always fails in the simulated gateway. */
export const MOCK_FAILURE_UPI = 'failure@razorpay';

/**
 * Phase 1 simulated gateway (rule 9). No network calls, no money moves; every
 * Payment is flagged `simulated` with a `MOCK-` reference.
 */
export class MockPaymentService implements IPaymentService {
  constructor(private readonly ctx: MockContext) {}

  listInvoices(query: CustomerInvoiceQuery): Promise<Paginated<Invoice>> {
    return respond(this.ctx, () => {
      assertCustomerAccess(this.ctx, query.customerId);
      const rows = this.refreshed(this.ctx.store.data.invoices.filter((i) => i.customerId === query.customerId)).sort(
        (a, b) => b.issuedOn.localeCompare(a.issuedOn) || a.number.localeCompare(b.number),
      );
      return paginate(rows, query);
    });
  }

  getInvoice(invoiceId: string): Promise<Invoice> {
    return respond(this.ctx, () => {
      const invoice = this.find(invoiceId);
      assertCustomerAccess(this.ctx, invoice.customerId);
      return this.refreshed([invoice])[0] ?? invoice;
    });
  }

  listPayments(query: CustomerPaymentQuery): Promise<Paginated<Payment>> {
    return respond(this.ctx, () => {
      assertCustomerAccess(this.ctx, query.customerId);
      const rows = this.ctx.store.data.payments.filter((p) => p.customerId === query.customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return paginate(rows, query);
    });
  }

  getAccountSummary(customerId: string): Promise<AccountSummary> {
    return respond(this.ctx, () => {
      assertCustomerAccess(this.ctx, customerId);
      const invoices = this.refreshed(this.ctx.store.data.invoices.filter((i) => i.customerId === customerId));
      const lastPayment =
        this.ctx.store.data.payments.filter((p) => p.customerId === customerId && p.status === 'SUCCESS').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
      return { outstanding: outstandingBalance(invoices), overdueCount: invoices.filter((i) => i.status === 'OVERDUE').length, lastPayment };
    });
  }

  payInvoice(input: PayInvoiceInput): Promise<Payment> {
    const latency = this.ctx.latency.max > 0 ? { min: 900, max: 1400 } : this.ctx.latency;
    return respond({ ...this.ctx, latency }, () => {
      const session = requireApprovedCustomer(this.ctx);
      const { method, upiId } = paymentSchema.parse({ method: input.method, upiId: input.upiId ?? '' });
      const invoice = this.find(input.invoiceId);
      assertCustomerAccess(this.ctx, invoice.customerId);
      if (invoice.amountPaid >= invoice.amount) throw new DomainError('ALREADY_PAID', 'This invoice is already paid.');

      const failed = input.mockOutcome === 'FAILURE' || (method === 'UPI' && upiId.toLowerCase() === MOCK_FAILURE_UPI);
      const payment: Payment = {
        id: this.ctx.store.nextId('pay'),
        invoiceId: invoice.id,
        customerId: session.customerId ?? invoice.customerId,
        amount: invoice.amount - invoice.amountPaid,
        method,
        status: failed ? 'FAILED' : 'SUCCESS',
        reference: `MOCK-${Date.now().toString(36).toUpperCase()}`,
        createdAt: new Date().toISOString(),
        failureReason: failed ? 'Simulated failure — the mock gateway declined this payment. No money was moved.' : null,
        simulated: true,
      };
      this.ctx.store.data.payments.push(payment);
      if (!failed) {
        invoice.amountPaid = invoice.amount;
        invoice.status = 'PAID';
      }
      audit(this.ctx, failed ? 'PAYMENT_FAILED' : 'PAYMENT_SUCCEEDED', 'PAYMENT', payment.id, `${failed ? 'Simulated failure for' : 'Simulated payment of'} invoice ${invoice.number} (₹${payment.amount}, ${method.replace('_', ' ')})`);
      this.ctx.store.commit();
      return payment;
    });
  }

  listAllInvoices(query: InvoiceQuery): Promise<Paginated<InvoiceView>> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const { customers, vehicles, payments } = this.ctx.store.data;
      const cMap = new Map(customers.map((c) => [c.id, c]));
      const vMap = new Map(vehicles.map((v) => [v.id, v]));
      const lastTx = new Map<string, string>();
      for (const p of payments) if ((lastTx.get(p.invoiceId) ?? '') < p.createdAt) lastTx.set(p.invoiceId, p.createdAt);
      const term = query.search ? searchKey(query.search.trim()) : '';
      const rows: InvoiceView[] = [];
      for (const inv of this.refreshed(this.ctx.store.data.invoices)) {
        if (query.cycle && inv.cycle !== query.cycle) continue;
        if (query.status && query.status !== 'ALL' && inv.status !== query.status) continue;
        const owner = cMap.get(inv.customerId);
        const v = vMap.get(inv.vehicleId);
        if (!owner || !v) continue;
        if (term && !searchKey(`${inv.number}|${owner.name}|${owner.block}${owner.flat}|${v.registration}`).includes(term)) continue;
        rows.push({ ...inv, ownerName: owner.name, block: owner.block, flat: owner.flat, registration: v.registration, lastTransactionAt: lastTx.get(inv.id) ?? null });
      }
      const rank = { OVERDUE: 0, DUE: 1, PAID: 2 } as const;
      rows.sort((a, b) => rank[a.status] - rank[b.status] || a.block.localeCompare(b.block) || Number(a.flat) - Number(b.flat));
      return paginate(rows, query);
    });
  }

  getCollectionsSummary(cycle: CycleMonth): Promise<CollectionsSummary> {
    return respond(this.ctx, () => {
      requireSession(this.ctx, 'ADMIN');
      const invoices = this.refreshed(this.ctx.store.data.invoices.filter((i) => i.cycle === cycle));
      return {
        cycle,
        billed: invoices.reduce((s, i) => s + i.amount, 0),
        collected: invoices.reduce((s, i) => s + i.amountPaid, 0),
        outstanding: outstandingBalance(invoices),
        overdueInvoices: invoices.filter((i) => i.status === 'OVERDUE').length,
      };
    });
  }

  overrideInvoiceStatus(input: InvoiceOverrideInput): Promise<Invoice> {
    return respond(this.ctx, () => {
      const session = requireSession(this.ctx, 'ADMIN');
      const { status, note } = invoiceOverrideSchema.parse({ status: input.status, note: input.note });
      const invoice = this.find(input.invoiceId);
      const before = invoiceStatusFor(invoice, this.ctx.today());
      if (status === 'PAID') {
        if (invoice.amountPaid < invoice.amount) {
          this.ctx.store.data.payments.push({
            id: this.ctx.store.nextId('pay'),
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            amount: invoice.amount - invoice.amountPaid,
            method: 'CASH',
            status: 'SUCCESS',
            reference: `MOCK-OFFICE-${Date.now().toString(36).toUpperCase()}`,
            createdAt: new Date().toISOString(),
            failureReason: null,
            simulated: true,
          });
        }
        invoice.amountPaid = invoice.amount;
      } else {
        invoice.amountPaid = 0;
      }
      invoice.overrideNote = `${note} — ${session.displayName}`;
      invoice.status = invoiceStatusFor(invoice, this.ctx.today());
      audit(this.ctx, 'INVOICE_OVERRIDDEN', 'INVOICE', invoice.id, `${invoice.number}: ${before} → ${invoice.status}. ${note}`);
      this.ctx.store.commit();
      return invoice;
    });
  }

  private find(invoiceId: string): Invoice {
    return this.ctx.store.data.invoices.find((i) => i.id === invoiceId) ?? notFound('Invoice');
  }

  /** Re-derives status against today so DUE rolls to OVERDUE without a job. */
  private refreshed(invoices: Invoice[]): Invoice[] {
    const today = this.ctx.today();
    for (const inv of invoices) inv.status = invoiceStatusFor(inv, today);
    return invoices;
  }
}
