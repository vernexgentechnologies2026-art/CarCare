import { PHOTO_COMPRESSION } from '@/constants';
import { DomainError } from './errors';

export interface CompressedPhoto {
  /** The compressed image that gets uploaded. */
  blob: Blob;
  bytes: number;
  originalBytes: number;
  width: number;
  height: number;
  mimeType: string;
  /** Encoder quality actually used (null when the original was kept). */
  quality: number | null;
}

/** "118 KB" / "1.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const canvasAvailable = (): boolean => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return false;
  // jsdom has no canvas encoder; tests exercise the passthrough path.
  return !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent));
};

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new DomainError('INVALID_PHOTO', 'This file could not be read as an image.'));
    };
    img.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Client-side compression (capacity budget, Section 28): longest side ≤ 1280px,
 * WebP (JPEG fallback) at quality 0.8, stepping quality down until the result
 * is ≤ ~150 KB, then shrinking the image if needed. Rejects anything still over
 * the 150 KB hard ceiling (also enforced by the photo gateway).
 */
export async function compressPhoto(file: Blob, opts = PHOTO_COMPRESSION): Promise<CompressedPhoto> {
  if (!file.type.startsWith('image/')) throw new DomainError('INVALID_PHOTO', 'Choose an image file.');

  if (!canvasAvailable()) {
    if (file.size > opts.maxCompressedBytes) throw new DomainError('PHOTO_TOO_LARGE', `Photo is ${formatBytes(file.size)} — the limit is ${formatBytes(opts.maxCompressedBytes)}.`);
    return { blob: file, bytes: file.size, originalBytes: file.size, width: 0, height: 0, mimeType: file.type, quality: null };
  }

  const img = await loadImage(file);
  const scale = Math.min(1, opts.maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new DomainError('INVALID_PHOTO', 'This device cannot process photos.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let type = 'image/webp';
  let quality: number = opts.quality;
  let blob = await encode(canvas, type, quality);
  if (!blob || blob.type !== 'image/webp') {
    type = 'image/jpeg';
    blob = await encode(canvas, type, quality);
  }
  while (blob && blob.size > opts.targetBytes && quality > opts.minQuality) {
    quality = Math.round((quality - 0.1) * 100) / 100;
    blob = await encode(canvas, type, quality);
  }
  // Still over the hard ceiling at minimum quality: shrink the image in steps.
  while (blob && blob.size > opts.maxCompressedBytes && Math.max(canvas.width, canvas.height) * 0.85 >= opts.minDimension) {
    canvas.width = Math.round(canvas.width * 0.85);
    canvas.height = Math.round(canvas.height * 0.85);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blob = await encode(canvas, type, quality);
  }
  if (!blob) throw new DomainError('INVALID_PHOTO', 'This photo could not be compressed.');
  if (blob.size > opts.maxCompressedBytes) {
    throw new DomainError('PHOTO_TOO_LARGE', `Photo is ${formatBytes(blob.size)} after compression — the limit is ${formatBytes(opts.maxCompressedBytes)}. Please retake it.`);
  }
  return { blob, bytes: blob.size, originalBytes: file.size, width: canvas.width, height: canvas.height, mimeType: type, quality };
}
