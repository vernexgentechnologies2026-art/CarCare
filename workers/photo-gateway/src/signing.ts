/**
 * Short-lived signed URLs for the private R2 bucket (Master Task Document §18.4, §20.1).
 * A token is base64url(JSON payload) + "." + base64url(HMAC-SHA256). Verification
 * uses crypto.subtle.verify, which compares in constant time.
 */

export type SignedOp = 'put' | 'get';

export interface SignedPayload {
  /** Object key in the bucket. */
  k: string;
  op: SignedOp;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

/** 15 minutes, for both upload and view links. */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('URL_SIGNING_SECRET must be at least 32 characters.');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(secret: string, payload: SignedPayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

/** Returns the payload when the token is authentic, unexpired and for this key/op; otherwise null. */
export async function verifyToken(
  secret: string,
  token: string,
  expected: { k: string; op: SignedOp },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SignedPayload | null> {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  let signature: Uint8Array;
  let payload: SignedPayload;
  try {
    signature = fromBase64Url(sig);
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), signature, encoder.encode(body));
    if (!ok) return null;
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SignedPayload;
  } catch {
    return null;
  }
  if (payload.k !== expected.k || payload.op !== expected.op) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;
  return payload;
}
