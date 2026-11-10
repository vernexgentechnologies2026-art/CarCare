/**
 * Razorpay webhook (deployed with verify_jwt = false — Razorpay has no user JWT;
 * the HMAC signature is the authentication).
 *
 * Idempotent: Razorpay retries deliveries and may send several events for one
 * payment (payment.captured, order.paid). The database locks the invoice and
 * razorpay_payment_id is unique, so each payment is credited exactly once.
 * Returns 2xx for handled and duplicate events, 5xx only when the database is
 * unavailable so that Razorpay retries.
 */
import { interpretWebhook, verifyWebhookSignature } from '../_shared/razorpay.ts';
import { env, HttpError, json, serviceRpc } from '../_shared/http.ts';

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  // Verify against the exact raw body — re-serialised JSON would not match.
  const raw = await request.text();
  if (!(await verifyWebhookSignature(raw, request.headers.get('X-Razorpay-Signature'), env('RAZORPAY_WEBHOOK_SECRET')))) {
    return json({ error: 'Invalid signature.' }, 401);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const action = interpretWebhook(payload);
  try {
    if (action.kind === 'captured') {
      const outcome = await serviceRpc<string>('apply_razorpay_payment', {
        p_order_id: action.orderId,
        p_payment_id: action.paymentId,
        p_amount_paise: action.amountPaise,
        p_method: action.method,
      });
      return json({ ok: true, outcome });
    }
    if (action.kind === 'failed') {
      const outcome = await serviceRpc<string>('record_failed_razorpay_payment', {
        p_order_id: action.orderId,
        p_payment_id: action.paymentId,
        p_amount_paise: action.amountPaise,
        p_reason: action.reason,
      });
      return json({ ok: true, outcome });
    }
    return json({ ok: true, outcome: 'ignored' });
  } catch (error) {
    // A business-rule rejection (e.g. amount mismatch, unknown order) will not
    // succeed on retry: acknowledge it so Razorpay stops, and flag it for review.
    if (error instanceof HttpError && error.status === 409) {
      console.error('razorpay-webhook: rejected event needs manual review', action.kind);
      return json({ ok: false, outcome: 'rejected' }, 200);
    }
    return json({ error: 'Temporarily unavailable.' }, 503);
  }
});
