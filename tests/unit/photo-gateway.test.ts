// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { runRetention, type Env, type R2BucketLike } from '../../workers/photo-gateway/src/index';
import { signToken, verifyToken } from '../../workers/photo-gateway/src/signing';
import { checkPhoto, MAX_PHOTO_BYTES, stripMetadata } from '../../workers/photo-gateway/src/validation';

const SECRET = 'test-url-signing-secret-placeholder-0123456789';
const VEH = '30000000-0000-4000-8000-000000000001';
const JOB = '70000000-0000-4000-8000-000000000001';
const KEY = `${VEH}/2026/11/${JOB}.webp`;
const ORIGIN = 'http://localhost:5174';

/** A structurally valid WebP of exactly `size` bytes (even, ≥ 20): RIFF/WEBP header + one 'VP8 ' chunk. */
const webp = (size: number) => {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  view.setUint32(4, size - 8, true);
  bytes.set([...'WEBPVP8 '].map((c) => c.charCodeAt(0)), 8);
  view.setUint32(16, size - 20, true);
  return bytes;
};

function memoryBucket() {
  const store = new Map<string, { bytes: Uint8Array; type?: string }>();
  const bucket: R2BucketLike = {
    head: async (k) => (store.has(k) ? {} : null),
    get: async (k) => {
      const o = store.get(k);
      return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: { contentType: o.type } } : null;
    },
    put: async (k, v, opts) => {
      store.set(k, { bytes: new Uint8Array(v as Uint8Array), type: opts?.httpMetadata?.contentType });
    },
    delete: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    },
  };
  return { store, bucket };
}

let env: Env;
let store: Map<string, { bytes: Uint8Array; type?: string }>;
let rpcCalls: Array<{ fn: string; args: Record<string, unknown>; auth: string | null; apikey: string | null }>;
let rpcResult: (fn: string, args: Record<string, unknown>) => { status: number; body: unknown };

beforeEach(() => {
  const mem = memoryBucket();
  store = mem.store;
  env = {
    PHOTOS: mem.bucket,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-placeholder',
    SUPABASE_SERVICE_ROLE_KEY: 'service-placeholder',
    URL_SIGNING_SECRET: SECRET,
    ALLOWED_ORIGINS: ORIGIN,
  };
  rpcCalls = [];
  rpcResult = (fn) => {
    if (fn === 'authorize_photo_upload' || fn === 'authorize_photo_view') return { status: 200, body: KEY };
    if (fn === 'register_uploaded_photo') return { status: 200, body: 'photo-1' };
    return { status: 404, body: {} };
  };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const fn = url.split('/rpc/')[1] ?? '';
    const args = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = init.headers as Record<string, string>;
    rpcCalls.push({ fn, args, auth: headers.Authorization ?? null, apikey: headers.apikey ?? null });
    const { status, body } = rpcResult(fn, args);
    return new Response(JSON.stringify(body), { status });
  });
});
afterEach(() => vi.unstubAllGlobals());

const call = (method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}) =>
  worker.fetch(new Request(`https://photos.example.dev${path}`, { method, ...init }), env);

async function uploadUrl(): Promise<string> {
  const res = await call('POST', '/v1/uploads', { body: JSON.stringify({ jobId: JOB }), headers: { Authorization: 'Bearer user-jwt', Origin: ORIGIN } });
  expect(res.status).toBe(200);
  const { uploadUrl: url } = (await res.json()) as { uploadUrl: string };
  return new URL(url).pathname + new URL(url).search;
}

describe('signed URLs', () => {
  it('expire after 15 minutes and are bound to key and operation', async () => {
    const now = 1_800_000_000;
    const token = await signToken(SECRET, { k: KEY, op: 'get', exp: now + 900 });
    expect(await verifyToken(SECRET, token, { k: KEY, op: 'get' }, now + 899)).not.toBeNull();
    expect(await verifyToken(SECRET, token, { k: KEY, op: 'get' }, now + 900)).toBeNull();
    expect(await verifyToken(SECRET, token, { k: KEY, op: 'put' }, now)).toBeNull();
    expect(await verifyToken(SECRET, token, { k: `${KEY}x`, op: 'get' }, now)).toBeNull();
    expect(await verifyToken('another-secret-of-sufficient-length-000000', token, { k: KEY, op: 'get' }, now)).toBeNull();
    expect(await verifyToken(SECRET, `${token}x`, { k: KEY, op: 'get' }, now)).toBeNull();
  });
});

describe('upload validation', () => {
  it('accepts WebP/JPEG up to 150 KB by content, not by claimed type', () => {
    expect(checkPhoto(webp(120 * 1024), 'image/webp')).toEqual({ ok: true, type: 'image/webp' });
    expect(checkPhoto(webp(MAX_PHOTO_BYTES + 2), 'image/webp')).toEqual({ ok: false, problem: 'TOO_LARGE' });
    expect(checkPhoto(new Uint8Array([0x3c, 0x73, 0x76, 0x67]), 'image/webp')).toEqual({ ok: false, problem: 'NOT_AN_IMAGE' });
    expect(checkPhoto(webp(1000), 'image/jpeg')).toEqual({ ok: false, problem: 'TYPE_MISMATCH' });
    expect(checkPhoto(new Uint8Array(0), null)).toEqual({ ok: false, problem: 'EMPTY' });
  });
});

describe('photo gateway', () => {
  it('authorises uploads with the user JWT, then stores and registers with the service role', async () => {
    const path = await uploadUrl();
    expect(rpcCalls[0]).toMatchObject({ fn: 'authorize_photo_upload', auth: 'Bearer user-jwt', apikey: 'anon-placeholder' });
    const res = await call('PUT', path, { body: webp(120 * 1024), headers: { 'Content-Type': 'image/webp' } });
    expect(res.status).toBe(201);
    expect(store.get(KEY)?.type).toBe('image/webp');
    expect(rpcCalls[1]).toMatchObject({ fn: 'register_uploaded_photo', apikey: 'service-placeholder', args: { p_job_id: JOB, p_storage_key: KEY, p_size_bytes: 120 * 1024 } });
  });

  it('rejects oversized, non-image and replayed uploads', async () => {
    const path = await uploadUrl();
    expect((await call('PUT', path, { body: webp(MAX_PHOTO_BYTES + 2), headers: { 'Content-Type': 'image/webp' } })).status).toBe(413);
    expect((await call('PUT', path, { body: new TextEncoder().encode('<script>'), headers: { 'Content-Type': 'image/webp' } })).status).toBe(415);
    expect((await call('PUT', path, { body: webp(1000), headers: { 'Content-Type': 'image/webp' } })).status).toBe(201);
    expect((await call('PUT', path, { body: webp(1000), headers: { 'Content-Type': 'image/webp' } })).status).toBe(409);
  });

  it('refuses a tampered or missing upload token', async () => {
    const path = await uploadUrl();
    expect((await call('PUT', path.replace('.webp', '.jpg'), { body: webp(1000) })).status).toBe(403);
    expect((await call('PUT', `/v1/objects/${KEY}`, { body: webp(1000) })).status).toBe(403);
  });

  it('removes the object again if the database refuses the registration', async () => {
    rpcResult = (fn) => (fn === 'register_uploaded_photo' ? { status: 400, body: { code: 'P0001', message: 'Storage key does not match the job.' } } : { status: 200, body: KEY });
    const path = await uploadUrl();
    expect((await call('PUT', path, { body: webp(1000), headers: { 'Content-Type': 'image/webp' } })).status).toBe(409);
    expect(store.size).toBe(0);
  });

  it('turns a database denial into 403 and needs a JWT', async () => {
    rpcResult = () => ({ status: 403, body: { code: '42501', message: 'Not allowed.' } });
    expect((await call('POST', '/v1/photos/80000000-0000-4000-8000-000000000001/view-url', { headers: { Authorization: 'Bearer other-user' } })).status).toBe(403);
    expect((await call('POST', '/v1/uploads', { body: JSON.stringify({ jobId: JOB }) })).status).toBe(401);
  });

  it('serves a private object only with a valid view link, with private caching', async () => {
    store.set(KEY, { bytes: webp(500), type: 'image/webp' });
    const res = await call('POST', '/v1/photos/80000000-0000-4000-8000-000000000001/view-url', { headers: { Authorization: 'Bearer user-jwt' } });
    const { url, expiresAt } = (await res.json()) as { url: string; expiresAt: string };
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    const got = await call('GET', new URL(url).pathname + new URL(url).search);
    expect(got.status).toBe(200);
    expect(got.headers.get('Cache-Control')).toMatch(/^private, max-age=\d+$/);
    expect((await got.arrayBuffer()).byteLength).toBe(500);
    expect((await call('GET', `/v1/objects/${KEY}`)).status).toBe(403);
  });

  it('only answers CORS for allowed origins', async () => {
    const ok = await worker.fetch(new Request('https://photos.example.dev/v1/uploads', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const bad = await worker.fetch(new Request('https://photos.example.dev/v1/uploads', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
    expect(bad.status).toBe(403);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('retention job', () => {
  it('deletes claimed objects from R2 and confirms them in the database', async () => {
    store.set('a', { bytes: webp(20) });
    store.set('b', { bytes: webp(20) });
    store.set('keep', { bytes: webp(20) });
    rpcResult = (fn, args) => {
      if (fn === 'claim_expired_photos') return { status: 200, body: [{ photo_id: 'p-a', storage_key: 'a' }, { photo_id: 'p-b', storage_key: 'b' }] };
      if (fn === 'confirm_photos_deleted') return { status: 200, body: (args.p_photo_ids as string[]).length };
      return { status: 404, body: {} };
    };
    expect(await runRetention(env, 500)).toBe(2);
    expect([...store.keys()]).toEqual(['keep']);
    expect(rpcCalls.map((c) => c.fn)).toEqual(['claim_expired_photos', 'confirm_photos_deleted']);
  });
});

describe('photo security audit', () => {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

  it('strips EXIF (e.g. GPS) and IPTC from JPEG, keeping the image data', () => {
    const exif = [...ascii('Exif\0\0'), ...ascii('GPSLatitude 13.0827N')];
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, exif.length + 2, ...exif, // APP1 EXIF
      0xff, 0xed, 0x00, 0x06, ...ascii('IPTC'), // APP13
      0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, // DQT (kept)
      0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9, // scan + EOI
    ]);
    const out = stripMetadata(jpeg, 'image/jpeg')!;
    const text = String.fromCharCode(...out);
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('IPTC');
    expect([...out]).toEqual([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
    expect(stripMetadata(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00]), 'image/jpeg')).toBeNull();
  });

  it('strips EXIF/XMP chunks from WebP and clears their VP8X flags', () => {
    const vp8x = [...ascii('VP8X'), ...le32(10), 0x0c | 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const exif = [...ascii('EXIF'), ...le32(3), ...ascii('GPS'), 0];
    const xmp = [...ascii('XMP '), ...le32(4), ...ascii('<x/>')];
    const img = [...ascii('VP8 '), ...le32(2), 0xaa, 0xbb];
    const body = [...ascii('WEBP'), ...vp8x, ...exif, ...xmp, ...img];
    const webpFile = new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
    const out = stripMetadata(webpFile, 'image/webp')!;
    const text = String.fromCharCode(...out);
    expect(text).not.toContain('EXIF');
    expect(text).not.toContain('XMP ');
    expect(text).toContain('VP8 ');
    expect(out[20]! & 0x0c).toBe(0); // VP8X flags byte
    expect(out[20]! & 0x10).toBe(0x10); // other flags untouched
    expect(out.length - 8).toBe(out[4]! | (out[5]! << 8)); // RIFF size rewritten
  });

  it('a raw storage key can never be fetched without a valid, matching, unexpired link', async () => {
    store.set(KEY, { bytes: webp(64), type: 'image/webp' });
    const now = Math.floor(Date.now() / 1000);
    const other = `${VEH}/2026/11/80000000-0000-4000-8000-000000000009.webp`;
    const tokens = {
      none: '',
      putToken: await signToken(SECRET, { k: KEY, op: 'put', exp: now + 900 }),
      otherKey: await signToken(SECRET, { k: other, op: 'get', exp: now + 900 }),
      expired: await signToken(SECRET, { k: KEY, op: 'get', exp: now - 1 }),
      wrongSecret: await signToken('a-different-secret-that-is-long-enough-000', { k: KEY, op: 'get', exp: now + 900 }),
    };
    for (const [name, t] of Object.entries(tokens)) {
      const res = await call('GET', `/v1/objects/${KEY}${t ? `?t=${encodeURIComponent(t)}` : ''}`);
      expect(res.status, name).toBe(403);
    }
    const valid = await signToken(SECRET, { k: KEY, op: 'get', exp: now + 900 });
    expect((await call('GET', `/v1/objects/${KEY}?t=${encodeURIComponent(valid)}`)).status).toBe(200);
  });
});
