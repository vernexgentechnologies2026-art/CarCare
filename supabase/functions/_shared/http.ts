/** Shared helpers for CarCare Edge Functions (Deno). No secrets are logged or returned. */

declare const Deno: { env: { get(name: string): string | undefined } };

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** PostgREST call as the service role (bypasses RLS — server only). */
export async function serviceRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new HttpError(err.code === 'P0001' ? 409 : 500, err.code === 'P0001' ? (err.message ?? 'Rejected.') : 'Database request failed.');
  }
  return (await res.json()) as T;
}

/** Calls a database function as the signed-in user, so the database decides access. */
export async function userRpc<T>(request: Request, fn: string, args: Record<string, unknown>): Promise<T> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in required.');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (res.status === 401) throw new HttpError(401, 'Sign in required.');
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string };
    throw new HttpError(err.code === '42501' ? 403 : err.code === 'P0001' ? 404 : 500, err.code === '42501' ? 'Not allowed.' : 'Invoice not found.');
  }
  return (await res.json()) as T;
}

/** Table read with the service role (server only), after authorisation was checked. */
export async function serviceSelect<T>(pathAndQuery: string): Promise<T[]> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${pathAndQuery}`, { headers });
  if (!res.ok) throw new HttpError(500, 'Database request failed.');
  return (await res.json()) as T[];
}

/** Razorpay REST call with Basic auth (key id + key secret). */
export async function razorpay<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const auth = btoa(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`);
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(502, 'Payment provider request failed.');
  return (await res.json()) as T;
}
