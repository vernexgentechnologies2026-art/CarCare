/**
 * POST { invoiceId } with the resident's JWT → Razorpay order for that invoice.
 * The amount always comes from the database, never from the client.
 */
import { cors, env, HttpError, json, razorpay, serviceRpc, serviceSelect, userRpc } from '../_shared/http.ts';

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };

interface InvoiceRow {
  id: string;
  number: string;
  amount_paise: number;
  amount_paid_paise: number;
  status: 'due' | 'paid' | 'overdue';
  razorpay_order_id: string | null;
}

Deno.serve(async (request) => {
  const headers = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Use POST.');
    const { invoiceId } = (await request.json().catch(() => ({}))) as { invoiceId?: unknown };
    if (typeof invoiceId !== 'string' || !/^[0-9a-f-]{36}$/.test(invoiceId)) throw new HttpError(400, 'invoiceId is required.');

    // Authorisation: the database only returns the caller's own invoice (admins excepted).
    const visible = await userRpc<{ id: string; status: string }>(request, 'get_invoice', { p_invoice_id: invoiceId });
    // Exact amounts in paise come from the server-side row, never from the client.
    const [invoice] = await serviceSelect<InvoiceRow>(
      `invoices?id=eq.${visible.id}&select=id,number,amount_paise,amount_paid_paise,status,razorpay_order_id`,
    );
    if (!invoice) throw new HttpError(404, 'Invoice not found.');
    if (invoice.status === 'paid') throw new HttpError(409, 'This invoice is already paid.');
    const amount = invoice.amount_paise - invoice.amount_paid_paise;

    let orderId = invoice.razorpay_order_id;
    if (!orderId) {
      const order = await razorpay<{ id: string }>('POST', 'orders', {
        amount,
        currency: 'INR',
        receipt: invoice.number,
        notes: { invoice_id: invoice.id },
      });
      // Stores the order once; a concurrent request gets the first order back.
      orderId = await serviceRpc<string>('attach_razorpay_order', { p_invoice_id: invoice.id, p_order_id: order.id });
    }
    return json({ orderId, amount, currency: 'INR', keyId: env('RAZORPAY_KEY_ID') }, 200, headers);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: error instanceof HttpError ? error.message : 'Something went wrong.' }, status, headers);
  }
});
