import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_COMPRESSION } from '@/constants';
import { compressPhoto } from '@/utils/photoCompressor';

/*
 * §28.2: every uploaded photo is ≤ 1280 px and ≤ 150 KB. jsdom has no image
 * encoder, so the canvas is replaced by a size model: encoded bytes ≈
 * width × height × quality × k, where k is the photo's "detail" (busy scenes
 * compress worse). The real encoder is exercised in the Playwright suite.
 */

let detail = 0.3;
let webpSupported = true;

class FakeImage {
  naturalWidth = 4000;
  naturalHeight = 3000;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Chrome/124');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => undefined } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb, type = 'image/png', quality = 0.92) {
    const out = type === 'image/webp' && !webpSupported ? 'image/png' : type;
    cb(new Blob([new Uint8Array(Math.round(this.width * this.height * Number(quality) * detail))], { type: out }));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const camera = () => new Blob([new Uint8Array(4 * 1024 * 1024)], { type: 'image/jpeg' });

describe('photo compression budget', () => {
  it('a typical 12 MP phone photo lands between 100 and 150 KB at ≤ 1280 px', async () => {
    detail = 0.3;
    const r = await compressPhoto(camera());
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(1280);
    expect(r.bytes).toBeLessThanOrEqual(150 * 1024);
    expect(r.bytes).toBeGreaterThanOrEqual(100 * 1024);
    expect(r.mimeType).toBe('image/webp');
  });

  it('never exceeds 150 KB or 1280 px across the realistic range of photo detail', async () => {
    for (let k = 0.05; k <= 0.85; k += 0.05) {
      detail = k;
      const r = await compressPhoto(camera());
      expect(r.bytes, `detail ${k.toFixed(2)}`).toBeLessThanOrEqual(PHOTO_COMPRESSION.maxCompressedBytes);
      expect(Math.max(r.width, r.height), `detail ${k.toFixed(2)}`).toBeLessThanOrEqual(PHOTO_COMPRESSION.maxDimension);
      expect(Math.max(r.width, r.height)).toBeGreaterThanOrEqual(PHOTO_COMPRESSION.minDimension);
    }
  });

  it('falls back to JPEG where WebP encoding is unsupported, with the same limits', async () => {
    detail = 0.3;
    webpSupported = false;
    try {
      const r = await compressPhoto(camera());
      expect(r.mimeType).toBe('image/jpeg');
      expect(r.bytes).toBeLessThanOrEqual(150 * 1024);
    } finally {
      webpSupported = true;
    }
  });

  it('rejects (asks for a retake) rather than upload anything over 150 KB', async () => {
    detail = 5; // pathological noise
    await expect(compressPhoto(camera())).rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE' });
  });

  it('rejects non-images', async () => {
    await expect(compressPhoto(new Blob(['x'], { type: 'text/plain' }))).rejects.toMatchObject({ code: 'INVALID_PHOTO' });
  });
});
