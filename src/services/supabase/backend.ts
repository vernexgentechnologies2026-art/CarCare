import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants';
import type { PageQuery, Paginated, PaymentMethod, SignedPhotoUrl } from '@/types';

/**
 * The narrow surface the Supabase services depend on. Production wires it to
 * supabase-js, the R2 photo gateway and Razorpay Checkout (`createSupabaseBackend`);
 * tests wire the same calls to a local PostgreSQL. All data access goes through
 * database functions (migration 004) — the services never query tables directly.
 */
export interface Backend {
  /** Calls a Postgres function; rejects with a DomainError on failure. */
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  auth: AuthPort;
  photos: PhotoPort;
  checkout: CheckoutPort;
}

export interface AuthPort {
  /** Rejects with INVALID_CREDENTIALS when the phone/password pair is wrong. */
  signIn(phone: string, password: string): Promise<void>;
  /** Creates the auth user and leaves it signed in (needed to call register_customer). */
  signUp(phone: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  hasSession(): Promise<boolean>;
}

export interface PhotoPort {
  /** Uploads the compressed after-wash photo through the gateway; returns the photo id. */
  upload(jobId: string, photo: Blob): Promise<string>;
  viewUrl(photoId: string): Promise<SignedPhotoUrl>;
}

export type CheckoutOutcome = { kind: 'paid' } | { kind: 'pending' } | { kind: 'failed'; reason: string } | { kind: 'cancelled' };

export interface CheckoutPort {
  /** Razorpay order → Checkout → server-side signature verification. */
  pay(invoiceId: string, method: PaymentMethod): Promise<CheckoutOutcome>;
}

/* ------------------------------------------------------------------ paging */

export function pageArgs(query: PageQuery): { p_limit: number; p_offset: number } {
  const limit = clampLimit(query.limit);
  const page = Math.max(1, Math.floor(query.page) || 1);
  return { p_limit: limit, p_offset: (page - 1) * limit };
}

export function toPaginated<T>(result: { items: T[]; total: number }, query: PageQuery): Paginated<T> {
  const limit = clampLimit(query.limit);
  const page = Math.max(1, Math.floor(query.page) || 1);
  return { items: result.items, total: result.total, page, limit, hasMore: page * limit < result.total };
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(1, Math.floor(limit) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
}

/** `'ALL'` and empty values become null so SQL treats them as "no filter". */
export const filterArg = (value: string | undefined | null): string | null => (value && value !== 'ALL' ? value : null);

/** Business date in India Standard Time, `YYYY-MM-DD`. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
