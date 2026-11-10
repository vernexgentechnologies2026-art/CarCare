import type { PGlite } from '@electric-sql/pglite';
import type { Backend, CheckoutOutcome } from '@/services/supabase/backend';
import { toDomainError } from '@/services/supabase/errors';
import { DomainError } from '@/utils/errors';
import { asAnon, asOwner, asService, asUser } from './pglite';

/** Postgres array literal for text[] parameters. */
const arrayLiteral = (values: unknown[]) => `{${values.map((v) => `"${String(v).replace(/["\\]/g, '\\$&')}"`).join(',')}}`;

/**
 * Test implementation of the Supabase services' Backend: database functions run
 * on PGlite as the signed-in user, sign-in uses an in-memory phone/password map,
 * and the photo gateway / Razorpay steps are simulated with the same database
 * calls the real Worker and Edge Functions make (service role).
 */
export class PgliteBackend implements Backend {
  private userId: string | null = null;
  private readonly accounts = new Map<string, { userId: string; password: string }>();
  /** What the simulated Razorpay checkout returns next. */
  nextCheckout: 'paid' | 'failed' | 'cancelled' = 'paid';

  constructor(private readonly db: PGlite) {}

  addAccount(phone: string, userId: string, password: string): void {
    this.accounts.set(phone, { userId, password });
  }

  private async actAsCurrent(): Promise<void> {
    if (this.userId) await asUser(this.db, this.userId);
    else await asAnon(this.db);
  }

  async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.actAsCurrent();
    const keys = Object.keys(args);
    const params = keys.map((k) => (Array.isArray(args[k]) ? arrayLiteral(args[k] as unknown[]) : args[k]));
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    try {
      const { rows } = await this.db.query<{ r: T }>(sql, params);
      return (rows[0]?.r ?? null) as T;
    } catch (error) {
      const e = error as { code?: string; message: string };
      throw toDomainError({ code: e.code, message: e.message });
    }
  }

  auth = {
    signIn: async (phone: string, password: string) => {
      const account = this.accounts.get(phone);
      if (!account || account.password !== password) throw new DomainError('INVALID_CREDENTIALS', 'Phone number or password is incorrect.');
      this.userId = account.userId;
    },
    signUp: async (phone: string, password: string) => {
      if (this.accounts.has(phone)) throw new DomainError('ALREADY_REGISTERED', 'This mobile number is already registered.');
      await asOwner(this.db);
      const { rows } = await this.db.query<{ id: string }>('insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id', [`${phone}@users.carcare.local`]);
      this.accounts.set(phone, { userId: rows[0]!.id, password });
      this.userId = rows[0]!.id;
    },
    signOut: async () => {
      this.userId = null;
    },
    hasSession: async () => this.userId !== null,
  };

  photos = {
    upload: async (jobId: string, photo: Blob) => {
      const key = await this.rpc<string>('authorize_photo_upload', { p_job_id: jobId });
      await asService(this.db);
      const { rows } = await this.db.query<{ id: string }>(`select public.register_uploaded_photo($1, $2, $3, $4) as id`, [jobId, key, photo.type, photo.size]);
      return rows[0]!.id;
    },
    viewUrl: async (photoId: string) => {
      const key = await this.rpc<string>('authorize_photo_view', { p_photo_id: photoId });
      return { url: `https://gateway.test/v1/objects/${key}`, expiresAt: new Date(Date.now() + 900_000).toISOString() };
    },
  };

  checkout = {
    pay: async (invoiceId: string): Promise<CheckoutOutcome> => {
      if (this.nextCheckout === 'cancelled') return { kind: 'cancelled' };
      if (this.nextCheckout === 'failed') return { kind: 'failed', reason: 'Card declined' };
      await asService(this.db);
      const orderId = `order_${invoiceId.slice(0, 8)}`;
      await this.db.query('select public.attach_razorpay_order($1, $2)', [invoiceId, orderId]);
      const { rows } = await this.db.query<{ due: number }>('select amount_paise - amount_paid_paise as due from public.invoices where id = $1', [invoiceId]);
      await this.db.query(`select public.apply_razorpay_payment($1, $2, $3, 'upi')`, [orderId, `pay_${invoiceId.slice(0, 8)}`, rows[0]!.due]);
      return { kind: 'paid' };
    },
  };
}
