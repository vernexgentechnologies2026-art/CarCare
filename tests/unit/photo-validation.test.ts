import { describe, expect, it } from 'vitest';
import { PHOTO_COMPRESSION } from '@/constants';
import { DomainError } from '@/utils/errors';
import { compressPhoto, formatBytes } from '@/utils/photoCompressor';
import { assertCanRecordOutcome, photoProblem, validateWashCompletion } from '@/utils/washCompletionRules';

const jpeg = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });

describe('wash completion photo validation (rule 3)', () => {
  it('returns false without a photo object', () => {
    expect(validateWashCompletion({})).toBe(false);
    expect(validateWashCompletion({ photo: undefined })).toBe(false);
    expect(validateWashCompletion({ photo: null })).toBe(false);
    expect(validateWashCompletion({ photo: 'photo.jpg' })).toBe(false);
  });

  it('rejects empty, non-image and oversized photos', () => {
    expect(validateWashCompletion({ photo: jpeg(0) })).toBe(false);
    expect(validateWashCompletion({ photo: new Blob(['x'], { type: 'text/plain' }) })).toBe(false);
    expect(validateWashCompletion({ photo: jpeg(PHOTO_COMPRESSION.maxCompressedBytes + 1) })).toBe(false);
    expect(photoProblem(jpeg(PHOTO_COMPRESSION.maxCompressedBytes + 1))).toMatch(/too large/);
  });

  it('accepts a compressed image within budget', () => {
    expect(validateWashCompletion({ photo: jpeg(120 * 1024) })).toBe(true);
  });

  it('service-side guard throws PHOTO_REQUIRED for completion without a photo', () => {
    expect(() => assertCanRecordOutcome('COMPLETED', null, null)).toThrow(DomainError);
    expect(() => assertCanRecordOutcome('VEHICLE_NOT_PRESENT', null, 'Slot empty')).not.toThrow();
  });

  it('compressor rejects results over 500 KB and reports sizes', async () => {
    await expect(compressPhoto(jpeg(600 * 1024))).rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE' });
    const ok = await compressPhoto(jpeg(118 * 1024));
    expect(ok.bytes).toBe(118 * 1024);
    expect(formatBytes(ok.bytes)).toBe('118 KB');
    await expect(compressPhoto(new Blob(['x'], { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'INVALID_PHOTO' });
  });
});
