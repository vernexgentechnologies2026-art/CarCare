import { z } from 'zod';
import { NOTE_MAX_LENGTH } from '@/utils/washCompletionRules';

export const notPresentSchema = z.object({
  note: z.string().trim().max(NOTE_MAX_LENGTH, `Keep the note under ${NOTE_MAX_LENGTH} characters`),
});
export type NotPresentValues = z.output<typeof notPresentSchema>;

export const rescheduleSchema = z.object({
  missedDate: z.string().min(1, 'Select the missed wash'),
  requestedDate: z.string().min(1, 'Pick a new date'),
  reason: z.string().trim().min(3, 'Tell us briefly why').max(200),
});
export type RescheduleValues = z.output<typeof rescheduleSchema>;
