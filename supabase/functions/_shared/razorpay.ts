/**
 * Razorpay server-side verification (Master Task Document §18.5, §20.2).
 * Pure Web Crypto, so it runs in Supabase Edge Functions (Deno) and in tests.
 * Secrets are passed in by the caller from the function's environment; they
 * are never logged or returned.
 */

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

export interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret).
 * Proves the payment ids came from Razorpay for this order. It does NOT prove
 * the payment was captured — confirm that with the Payments API or the webhook.
 */
export async function verifyPaymentSignature(result: CheckoutResult, keySecret: string): Promise<boolean> {
  if (!result.razorpay_order_id || !result.razorpay_payment_id || !result.razorpay_signature) return false;
  const expected = await hmacSha256Hex(keySecret, `${result.razorpay_order_id}|${result.razorpay_payment_id}`);
  return timingSafeEqualHex(expected, result.razorpay_signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret) in X-Razorpay-Signature. */
export async function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string): Promise<boolean> {
  if (!signature) return false;
  return timingSafeEqualHex(await hmacSha256Hex(webhookSecret, rawBody), signature);
}

export type PaymentMethodDb = 'upi' | 'card' | 'net_banking' | null;

export function toDbMethod(method: unknown): PaymentMethodDb {
  if (method === 'upi' || method === 'card') return method;
  if (method === 'netbanking') return 'net_banking';
  return null;
}

export type WebhookAction =
  | { kind: 'captured'; orderId: string; paymentId: string; amountPaise: number; method: PaymentMethodDb }
  | { kind: 'failed'; orderId: string; paymentId: string; amountPaise: number; reason: string }
  | { kind: 'ignored'; event: string };

interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  method?: string;
  error_description?: string;
}

/** Maps a verified webhook payload to what the database should do. */
export function interpretWebhook(body: unknown): WebhookAction {
  const event = (body as { event?: string })?.event ?? 'unknown';
  const payment = (body as { payload?: { payment?: { entity?: RazorpayPaymentEntity } } })?.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id || typeof payment.amount !== 'number' || payment.currency !== 'INR') {
    return { kind: 'ignored', event };
  }
  if (event === 'payment.captured' || event === 'order.paid') {
    return { kind: 'captured', orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount, method: toDbMethod(payment.method) };
  }
  if (event === 'payment.failed') {
    return { kind: 'failed', orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount, reason: (payment.error_description ?? 'Payment failed').slice(0, 300) };
  }
  return { kind: 'ignored', event };
}
