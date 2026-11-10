// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  hmacSha256Hex,
  interpretWebhook,
  timingSafeEqualHex,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../../supabase/functions/_shared/razorpay.ts';

// Placeholder secrets for tests only — not real credentials.
const KEY_SECRET = 'test_key_secret_placeholder';
const WEBHOOK_SECRET = 'test_webhook_secret_placeholder';

describe('HMAC-SHA256', () => {
  it('matches the RFC 4231 test vector', async () => {
    expect(await hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('compares hex in constant time and rejects length differences', () => {
    expect(timingSafeEqualHex('abcd', 'ABCD')).toBe(true);
    expect(timingSafeEqualHex('abcd', 'abce')).toBe(false);
    expect(timingSafeEqualHex('abcd', 'abcd00')).toBe(false);
  });
});

describe('checkout signature (order_id|payment_id)', () => {
  it('accepts the genuine signature and rejects tampering', async () => {
    const signature = await hmacSha256Hex(KEY_SECRET, 'order_ABC|pay_XYZ');
    const result = { razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_XYZ', razorpay_signature: signature };
    expect(await verifyPaymentSignature(result, KEY_SECRET)).toBe(true);
    expect(await verifyPaymentSignature({ ...result, razorpay_payment_id: 'pay_OTHER' }, KEY_SECRET)).toBe(false);
    expect(await verifyPaymentSignature({ ...result, razorpay_order_id: 'order_OTHER' }, KEY_SECRET)).toBe(false);
    expect(await verifyPaymentSignature(result, 'wrong_secret')).toBe(false);
    expect(await verifyPaymentSignature({ ...result, razorpay_signature: '' }, KEY_SECRET)).toBe(false);
  });
});

describe('webhook', () => {
  const event = (name: string, entity: Record<string, unknown>) => ({ event: name, payload: { payment: { entity } } });
  const captured = event('payment.captured', { id: 'pay_1', order_id: 'order_1', amount: 100, currency: 'INR', method: 'netbanking' });

  it('verifies the signature over the exact raw body', async () => {
    const raw = JSON.stringify(captured);
    const sig = await hmacSha256Hex(WEBHOOK_SECRET, raw);
    expect(await verifyWebhookSignature(raw, sig, WEBHOOK_SECRET)).toBe(true);
    expect(await verifyWebhookSignature(`${raw} `, sig, WEBHOOK_SECRET)).toBe(false);
    expect(await verifyWebhookSignature(raw, null, WEBHOOK_SECRET)).toBe(false);
  });

  it('maps captured, failed and unrelated events', () => {
    expect(interpretWebhook(captured)).toEqual({ kind: 'captured', orderId: 'order_1', paymentId: 'pay_1', amountPaise: 100, method: 'net_banking' });
    expect(interpretWebhook(event('payment.failed', { id: 'pay_2', order_id: 'order_1', amount: 100, currency: 'INR', error_description: 'Declined' }))).toEqual({
      kind: 'failed', orderId: 'order_1', paymentId: 'pay_2', amountPaise: 100, reason: 'Declined',
    });
    expect(interpretWebhook(event('refund.created', { id: 'pay_1', order_id: 'order_1', amount: 100, currency: 'INR' })).kind).toBe('ignored');
    expect(interpretWebhook(event('payment.captured', { id: 'pay_1', order_id: 'order_1', amount: 100, currency: 'USD' })).kind).toBe('ignored');
  });
});
