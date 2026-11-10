/**
 * Server-side upload checks (Master Task Document §18.4, §28.2). The browser
 * already compresses to ≤150 KB; this is the enforcement point that a
 * modified client cannot skip.
 */

/** Hard ceiling, matching wash_photos.size_bytes and the client compressor. */
export const MAX_PHOTO_BYTES = 150 * 1024;

export type PhotoContentType = 'image/webp' | 'image/jpeg';

/** Object keys issued by authorize_photo_upload: {vehicle}/{yyyy}/{mm}/{job}.{webp|jpg} */
const KEY_PATTERN = /^([0-9a-f-]{36})\/(\d{4})\/(\d{2})\/([0-9a-f-]{36})\.(webp|jpg)$/;

export function parseObjectKey(key: string): { vehicleId: string; jobId: string; ext: 'webp' | 'jpg' } | null {
  const m = KEY_PATTERN.exec(key);
  if (!m) return null;
  return { vehicleId: m[1] as string, jobId: m[4] as string, ext: m[5] as 'webp' | 'jpg' };
}

/** Detects the real format from the file's first bytes, ignoring what the client claims. */
export function sniffImageType(bytes: Uint8Array): PhotoContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export type PhotoProblem = 'EMPTY' | 'TOO_LARGE' | 'NOT_AN_IMAGE' | 'TYPE_MISMATCH';

/** Validates an upload body. `declaredType` is the request's Content-Type. */
export function checkPhoto(bytes: Uint8Array, declaredType: string | null): { ok: true; type: PhotoContentType } | { ok: false; problem: PhotoProblem } {
  if (bytes.length === 0) return { ok: false, problem: 'EMPTY' };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, problem: 'TOO_LARGE' };
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, problem: 'NOT_AN_IMAGE' };
  if (declaredType && declaredType.split(';')[0]?.trim() !== type) return { ok: false, problem: 'TYPE_MISMATCH' };
  return { ok: true, type };
}

/**
 * Removes EXIF / XMP / IPTC metadata (e.g. GPS location, device serial) so a
 * modified client can't leak it (§26.2). The image data itself is untouched.
 *  - JPEG: drops APP1 (EXIF/XMP) and APP13 (IPTC) segments before the scan.
 *  - WebP: drops EXIF and "XMP " chunks and clears their VP8X flags.
 * Returns null if the container is malformed (the upload is then rejected).
 */
export function stripMetadata(bytes: Uint8Array, type: PhotoContentType): Uint8Array | null {
  return type === 'image/jpeg' ? stripJpeg(bytes) : stripWebp(bytes);
}

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1] as number;
    if (marker === 0xda) {
      // Start of scan: the rest is image data.
      out.push(bytes.subarray(i));
      return concat(out);
    }
    const length = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    if (length < 2 || i + 2 + length > bytes.length) return null;
    const isMetadata = marker === 0xe1 || marker === 0xed;
    if (!isMetadata) out.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return null;
}

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12) return null;
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
  const kept: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const id = tag(i);
    const size = (bytes[i + 4] as number) | ((bytes[i + 5] as number) << 8) | ((bytes[i + 6] as number) << 16) | ((bytes[i + 7] as number) << 24);
    const end = i + 8 + size + (size % 2);
    if (size < 0 || end > bytes.length + (size % 2)) return null;
    if (id !== 'EXIF' && id !== 'XMP ') {
      const chunk = bytes.slice(i, Math.min(end, bytes.length));
      if (id === 'VP8X' && chunk.length > 8) chunk[8] = (chunk[8] as number) & ~0x0c; // clear EXIF (0x08) and XMP (0x04) flags
      kept.push(chunk);
    }
    i = end;
  }
  const body = concat(kept);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 4), 0);
  const riffSize = body.length + 4;
  header.set([riffSize & 0xff, (riffSize >> 8) & 0xff, (riffSize >> 16) & 0xff, (riffSize >>> 24) & 0xff], 4);
  header.set(bytes.subarray(8, 12), 8);
  return concat([header, body]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
