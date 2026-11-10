import { PHOTO_COMPRESSION } from '@/constants';
import type { SignedPhotoUrl } from '@/types';
import { DomainError } from '@/utils/errors';

/**
 * Browser client for the R2 photo gateway Worker (workers/photo-gateway).
 * Photos never go to Supabase Storage. The gateway checks with the database
 * (using the caller's JWT) before issuing any 15-minute signed URL, and
 * enforces the 150 KB / image-type limits again on its side.
 */
export class PhotoGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: () => Promise<string>,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await gatewayError(res);
    return (await res.json()) as T;
  }

  /** Rule 3: uploads the compressed after-wash photo for a job; returns the photo id. */
  async uploadAfterWashPhoto(jobId: string, photo: Blob): Promise<string> {
    if (photo.size === 0 || !/^image\/(jpeg|webp)$/.test(photo.type)) {
      throw new DomainError('PHOTO_REQUIRED', 'A compressed JPEG or WebP photo is required to complete a wash.');
    }
    if (photo.size > PHOTO_COMPRESSION.maxCompressedBytes) {
      throw new DomainError('PHOTO_TOO_LARGE', 'The photo is still too large after compression. Please retake it.');
    }
    const { uploadUrl } = await this.post<{ uploadUrl: string }>('/v1/uploads', { jobId });
    const res = await this.fetchImpl(uploadUrl, { method: 'PUT', headers: { 'Content-Type': photo.type }, body: photo });
    if (!res.ok) throw await gatewayError(res);
    const { photoId } = (await res.json()) as { photoId: string };
    return photoId;
  }

  async viewUrl(photoId: string): Promise<SignedPhotoUrl> {
    return this.post<SignedPhotoUrl>(`/v1/photos/${encodeURIComponent(photoId)}/view-url`);
  }
}

async function gatewayError(res: Response): Promise<DomainError> {
  const { error } = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 || res.status === 403) return new DomainError('FORBIDDEN', 'You don’t have access to this.');
  if (res.status === 409) return new DomainError('RULE_VIOLATION', error ?? 'This photo was already uploaded.');
  if (res.status === 413 || res.status === 415) return new DomainError('INVALID_PHOTO', 'This photo was rejected. Please retake it.');
  return new DomainError('BACKEND_ERROR', 'Something went wrong. Please try again.');
}
