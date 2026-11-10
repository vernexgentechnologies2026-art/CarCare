import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentMethod } from '@/types';
import { DomainError } from '@/utils/errors';
import type { Backend, CheckoutOutcome } from './backend';
import { toDomainError } from './errors';
import { PhotoGatewayClient } from './photoGatewayClient';

export interface SupabaseBackendConfig {
  /** Public URL of the R2 photo gateway Worker. */
  photoGatewayUrl: string;
  /**
   * Residents sign in with mobile + password. Supabase Auth stores them as
   * `<10-digit mobile>@<authEmailDomain>` email users (email confirmation off),
   * so no SMS provider is needed until OTP sign-in is introduced.
   */
  authEmailDomain: string;
}

const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export function createSupabaseBackend(client: SupabaseClient, config: SupabaseBackendConfig): Backend {
  const email = (phone: string) => `${phone}@${config.authEmailDomain}`;

  const accessToken = async (): Promise<string> => {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new DomainError('FORBIDDEN', 'Your session has ended. Please sign in again.');
    return token;
  };

  const gateway = new PhotoGatewayClient(config.photoGatewayUrl.replace(/\/$/, ''), accessToken);

  const invoke = async <T>(fn: string, body: unknown): Promise<T> => {
    const { data, error } = await client.functions.invoke<T>(fn, { body: body as Record<string, unknown> });
    if (error || data === null) {
      const detail = (await (error as { context?: Response } | null)?.context?.json?.().catch(() => null)) as { error?: string } | null;
      throw new DomainError('PAYMENT_ERROR', detail?.error ?? 'The payment service is unavailable. Please try again.');
    }
    return data;
  };

  return {
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw toDomainError(error);
      return data as T;
    },

    auth: {
      async signIn(phone, password) {
        const { error } = await client.auth.signInWithPassword({ email: email(phone), password });
        if (error) throw new DomainError('INVALID_CREDENTIALS', 'Phone number or password is incorrect.');
      },
      async signUp(phone, password) {
        const { data, error } = await client.auth.signUp({ email: email(phone), password });
        if (error) {
          if (/already registered|already exists/i.test(error.message)) {
            throw new DomainError('ALREADY_REGISTERED', 'This mobile number is already registered.');
          }
          throw new DomainError('SIGN_UP_FAILED', 'Registration could not be completed. Please try again.');
        }
        if (!data.session) {
          // Email confirmation is on in Supabase Auth; residents have no inbox for these addresses.
          throw new DomainError('SIGN_UP_FAILED', 'Registration is not available right now. Please contact the facility office.');
        }
      },
      async signOut() {
        await client.auth.signOut();
      },
      async hasSession() {
        const { data } = await client.auth.getSession();
        return Boolean(data.session);
      },
    },

    photos: {
      upload: (jobId, photo) => gateway.uploadAfterWashPhoto(jobId, photo),
      viewUrl: (photoId) => gateway.viewUrl(photoId),
    },

    checkout: {
      async pay(invoiceId: string, method: PaymentMethod): Promise<CheckoutOutcome> {
        const order = await invoke<{ orderId: string; amount: number; currency: string; keyId: string }>('razorpay-create-order', { invoiceId });
        const result = await openCheckout(order, method);
        if (result.kind !== 'success') return result;
        const verified = await invoke<{ status: 'paid' | 'pending' }>('razorpay-verify', result.response);
        return verified.status === 'paid' ? { kind: 'paid' } : { kind: 'pending' };
      },
    },
  };
}

/* ------------------------------------------------------------------ Razorpay Checkout */

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (r: { error?: { description?: string } }) => void): void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

let checkoutScript: Promise<RazorpayCtor> | null = null;

function loadCheckout(): Promise<RazorpayCtor> {
  checkoutScript ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const existing = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
    if (existing) return resolve(existing);
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      if (ctor) resolve(ctor);
      else reject(new DomainError('PAYMENT_ERROR', 'The payment window could not be loaded.'));
    };
    script.onerror = () => {
      checkoutScript = null;
      reject(new DomainError('PAYMENT_ERROR', 'The payment window could not be loaded. Check your connection.'));
    };
    document.head.appendChild(script);
  });
  return checkoutScript;
}

const RAZORPAY_METHOD: Partial<Record<PaymentMethod, string>> = { UPI: 'upi', CARD: 'card', NET_BANKING: 'netbanking' };

async function openCheckout(
  order: { orderId: string; amount: number; currency: string; keyId: string },
  method: PaymentMethod,
): Promise<{ kind: 'success'; response: RazorpayResponse } | { kind: 'failed'; reason: string } | { kind: 'cancelled' }> {
  const Razorpay = await loadCheckout();
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: Parameters<typeof resolve>[0]) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'CarCare',
      prefill: { method: RAZORPAY_METHOD[method] },
      handler: (response: RazorpayResponse) => settle({ kind: 'success', response }),
      modal: { ondismiss: () => settle({ kind: 'cancelled' }) },
    });
    rzp.on('payment.failed', (r) => settle({ kind: 'failed', reason: r.error?.description ?? 'The payment was declined.' }));
    rzp.open();
  });
}
