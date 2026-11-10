/**
 * CarCare photo gateway — Cloudflare Worker in front of the private R2 bucket
 * `carcare-photos` (Master Task Document §18.4, §20.1, §28).
 *
 *   POST /v1/uploads                 {jobId}   Bearer <user JWT>  → 15-min signed upload URL
 *   PUT  /v1/objects/<key>?t=<token>           image body         → validates, stores, registers
 *   POST /v1/photos/<photoId>/view-url         Bearer <user JWT>  → 15-min signed view URL
 *   GET  /v1/objects/<key>?t=<token>                              → streams the private object
 *   scheduled (daily Cron Trigger)                                → 60-day retention cleanup
 *
 * Authorisation always comes from the database: the Worker asks Supabase
 * (authorize_photo_upload / authorize_photo_view) with the caller's own JWT,
 * so RLS and the business rules decide. The bucket has no public access.
 */
import { signToken, verifyToken, SIGNED_URL_TTL_SECONDS } from './signing';
import { checkPhoto, MAX_PHOTO_BYTES, parseObjectKey, stripMetadata } from './validation';

/* Minimal Workers runtime types, so this file needs no extra dependency. */
export interface R2ObjectLike {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}
export interface R2BucketLike {
  head(key: string): Promise<unknown | null>;
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  PHOTOS: R2BucketLike;
  /** Public project URL and anon key (not secret). */
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** Secrets — set with `wrangler secret put`, never committed. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  URL_SIGNING_SECRET: string;
  /** Comma-separated list of allowed web origins, e.g. https://app.example.com */
  ALLOWED_ORIGINS: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ helpers */

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

function bearer(request: Request): string {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Sign in required.');
  return token;
}

/** Calls a Postgres function through PostgREST, as the user (JWT) or as the service role. */
async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>, as: { userJwt: string } | 'service'): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (as === 'service') {
    headers.apikey = env.SUPABASE_SERVICE_ROLE_KEY;
    // New-style secret keys are not JWTs and go in `apikey` only.
    if (!env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')) headers.Authorization = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
  } else {
    headers.apikey = env.SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${as.userJwt}`;
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    if (res.status === 401 || err.code === '42501' || err.code === 'PGRST301') throw new HttpError(403, 'Not allowed.');
    if (err.code === 'P0001') throw new HttpError(409, err.message ?? 'Not allowed.');
    throw new HttpError(502, 'Database request failed.');
  }
  return (await res.json()) as T;
}

function objectUrl(request: Request, key: string, token: string): string {
  return `${new URL(request.url).origin}/v1/objects/${key}?t=${encodeURIComponent(token)}`;
}

/* ------------------------------------------------------------------ routes */

async function createUpload(request: Request, env: Env): Promise<Response> {
  const jwt = bearer(request);
  const { jobId } = (await request.json().catch(() => ({}))) as { jobId?: unknown };
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/.test(jobId)) throw new HttpError(400, 'jobId is required.');
  const key = await rpc<string>(env, 'authorize_photo_upload', { p_job_id: jobId }, { userJwt: jwt });
  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const token = await signToken(env.URL_SIGNING_SECRET, { k: key, op: 'put', exp });
  return json({ uploadUrl: objectUrl(request, key, token), expiresAt: new Date(exp * 1000).toISOString(), maxBytes: MAX_PHOTO_BYTES });
}

async function putObject(request: Request, env: Env, key: string, token: string): Promise<Response> {
  if (!(await verifyToken(env.URL_SIGNING_SECRET, token, { k: key, op: 'put' }))) throw new HttpError(403, 'Upload link is invalid or expired.');
  const parsed = parseObjectKey(key);
  if (!parsed) throw new HttpError(400, 'Invalid object key.');

  const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
  if (declaredLength > MAX_PHOTO_BYTES) throw new HttpError(413, 'Photo is larger than 150 KB.');
  const bytes = new Uint8Array(await request.arrayBuffer());
  const check = checkPhoto(bytes, request.headers.get('Content-Type'));
  if (!check.ok) throw new HttpError(check.problem === 'TOO_LARGE' ? 413 : 415, `Photo rejected: ${check.problem}.`);

  const clean = stripMetadata(bytes, check.type);
  if (!clean) throw new HttpError(415, 'Photo rejected: MALFORMED.');

  // A JPEG fallback (browsers without WebP encoding) is stored with a .jpg extension.
  const finalKey = key.replace(/\.(webp|jpg)$/, check.type === 'image/jpeg' ? '.jpg' : '.webp');
  if ((await env.PHOTOS.head(key)) || (await env.PHOTOS.head(finalKey))) throw new HttpError(409, 'A photo already exists for this wash.');

  await env.PHOTOS.put(finalKey, clean, { httpMetadata: { contentType: check.type } });
  try {
    const photoId = await rpc<string>(
      env,
      'register_uploaded_photo',
      { p_job_id: parsed.jobId, p_storage_key: finalKey, p_content_type: check.type, p_size_bytes: clean.length },
      'service',
    );
    return json({ photoId, bytes: clean.length, contentType: check.type }, 201);
  } catch (error) {
    // Never leave an unregistered object behind.
    await env.PHOTOS.delete(finalKey);
    throw error;
  }
}

async function createViewUrl(request: Request, env: Env, photoId: string): Promise<Response> {
  const jwt = bearer(request);
  if (!/^[0-9a-f-]{36}$/.test(photoId)) throw new HttpError(400, 'Invalid photo id.');
  const key = await rpc<string>(env, 'authorize_photo_view', { p_photo_id: photoId }, { userJwt: jwt });
  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const token = await signToken(env.URL_SIGNING_SECRET, { k: key, op: 'get', exp });
  return json({ url: objectUrl(request, key, token), expiresAt: new Date(exp * 1000).toISOString() });
}

async function getObject(env: Env, key: string, token: string): Promise<Response> {
  const payload = await verifyToken(env.URL_SIGNING_SECRET, token, { k: key, op: 'get' });
  if (!payload) throw new HttpError(403, 'Photo link is invalid or expired.');
  const object = await env.PHOTOS.get(key);
  if (!object) throw new HttpError(404, 'Photo not found.');
  const maxAge = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // the browser may reuse it until the link expires; shared caches may not
      'Cache-Control': `private, max-age=${maxAge}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

/* ------------------------------------------------------------------ retention */

/** Deletes photos past the 60-day retention from R2, then confirms in the database. */
export async function runRetention(env: Env, batchSize = 500): Promise<number> {
  let total = 0;
  for (let round = 0; round < 20; round++) {
    const expired = await rpc<Array<{ photo_id: string; storage_key: string }>>(env, 'claim_expired_photos', { p_limit: batchSize }, 'service');
    if (expired.length === 0) break;
    await env.PHOTOS.delete(expired.map((p) => p.storage_key));
    total += await rpc<number>(env, 'confirm_photos_deleted', { p_photo_ids: expired.map((p) => p.photo_id) }, 'service');
    if (expired.length < batchSize) break;
  }
  return total;
}

/* ------------------------------------------------------------------ entry */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors });
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      let response: Response;
      if (request.method === 'POST' && path === '/v1/uploads') {
        response = await createUpload(request, env);
      } else if (request.method === 'POST' && /^\/v1\/photos\/[^/]+\/view-url$/.test(path)) {
        response = await createViewUrl(request, env, path.split('/')[3] ?? '');
      } else if ((request.method === 'PUT' || request.method === 'GET') && path.startsWith('/v1/objects/')) {
        const key = decodeURIComponent(path.slice('/v1/objects/'.length));
        const token = url.searchParams.get('t') ?? '';
        response = request.method === 'PUT' ? await putObject(request, env, key, token) : await getObject(env, key, token);
      } else {
        throw new HttpError(404, 'Not found.');
      }
      for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
      return response;
    } catch (error) {
      // Never echo internals or secrets to the client or the logs.
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : 'Something went wrong.';
      if (status >= 500) console.error('photo-gateway error', status);
      return json({ error: message }, status, cors);
    }
  },

  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContextLike): Promise<void> {
    ctx.waitUntil(
      runRetention(env).then((n) => console.log(`retention: removed ${n} photos past 60 days`)),
    );
  },
};
