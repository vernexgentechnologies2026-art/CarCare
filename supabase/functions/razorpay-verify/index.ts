/**
 * POST { razorpay_order_id, razorpay_payment_id, razorpay_signature } after
 * Checkout. Verifies the HMAC-SHA256 signature, then confirms with Razorpay
 * that the payment is captured for the right amount before crediting. The
 * webhook does the same independently; the database credits only once.
 */
import { verifyPaymentSignature, toDbMethod, type CheckoutResult } from '../_shared/razorpay.ts';
import { cors, env, HttpError, json, razorpay, serviceRpc } from '../_shared/http.ts';

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };

interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method?: string;
}

Deno.serve(async (request) => {
  const headers = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Use POST.');
    if (!request.headers.get('Authorization')?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in required.');
    const body = (await request.json().catch(() => ({}))) as Partial<CheckoutResult>;
    const result: CheckoutResult = {
      razorpay_order_id: String(body.razorpay_order_id ?? ''),
      razorpay_payment_id: String(body.razorpay_payment_id ?? ''),
      razorpay_signature: String(body.razorpay_signature ?? ''),
    };
    if (!(await verifyPaymentSignature(result, env('RAZORPAY_KEY_SECRET')))) throw new HttpError(400, 'Payment signature is invalid.');

    // Never trust the browser's "success": ask Razorpay.
    const payment = await razorpay<RazorpayPayment>('GET', `payments/${encodeURIComponent(result.razorpay_payment_id)}`);
    if (payment.order_id !== result.razorpay_order_id || payment.currency !== 'INR') throw new HttpError(400, 'Payment does not match the order.');
    if (payment.status !== 'captured') {
      // Authorised but not yet captured: the payment.captured webhook will credit it.
      return json({ status: 'pending' }, 202, headers);
    }
    const outcome = await serviceRpc<string>('apply_razorpay_payment', {
      p_order_id: payment.order_id,
      p_payment_id: payment.id,
      p_amount_paise: payment.amount,
      p_method: toDbMethod(payment.method),
    });
    return json({ status: 'paid', outcome }, 200, headers);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: error instanceof HttpError ? error.message : 'Something went wrong.' }, status, headers);
  }
});
