import { PHOTO_COMPRESSION } from '@/constants';
import type { ISODate, JobStatus, WashOutcome } from '@/types';
import { DomainError } from './errors';

export const NOTE_MAX_LENGTH = 280;

/** Why a photo can't be used to complete a wash, or null when it is valid. */
export function photoProblem(photo: unknown): string | null {
  if (!(photo instanceof Blob) || photo.size === 0) return 'An after-wash photo is required before marking a wash as completed.';
  if (!photo.type.startsWith('image/')) return 'The after-wash photo must be an image.';
  if (photo.size > PHOTO_COMPRESSION.maxCompressedBytes) return 'The photo is still too large after compression. Please retake it.';
  return null;
}

/**
 * Business rule 3: a wash can only be completed with a valid, attached
 * after-wash photo. Drives the disabled state of the completion button and is
 * re-checked by the service.
 */
export function validateWashCompletion(input: { photo?: unknown }): boolean {
  return photoProblem(input.photo) === null;
}

export function assertCanRecordOutcome(outcome: WashOutcome, photo: unknown, note: string | null): void {
  if (outcome === 'COMPLETED') {
    const problem = photoProblem(photo);
    if (problem) throw new DomainError('PHOTO_REQUIRED', problem);
  }
  if (note !== null && note.length > NOTE_MAX_LENGTH) {
    throw new DomainError('NOTE_TOO_LONG', `Note must be ${NOTE_MAX_LENGTH} characters or fewer.`);
  }
}

/** Outcomes are recorded once, and only on the scheduled day. */
export function assertRecordable(job: { status: JobStatus; date: ISODate }, today: ISODate): void {
  if (job.status !== 'PENDING') throw new DomainError('ALREADY_RECORDED', 'This wash has already been recorded.');
  if (job.date !== today) throw new DomainError('WRONG_DAY', 'Washes can only be recorded on the scheduled day.');
}

/** UI-side mirror of the rules, so actions can be hidden before a round trip. */
export function canRecord(job: { status: JobStatus; date: ISODate }, today: ISODate): boolean {
  return job.status === 'PENDING' && job.date === today;
}
