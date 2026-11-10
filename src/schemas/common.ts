/** Reusable field schemas. Services re-validate input with these — the UI is not trusted. */
import { z } from 'zod';
import { CAR_SIZES, PAYMENT_METHODS, SCHEDULE_PATTERNS } from '@/constants';
import type { CarSize, PaymentMethod, SchedulePattern } from '@/types';
import { normalisePhone, normaliseRegistration } from '@/utils/normalisers';

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .transform(normalisePhone)
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number');

export const registrationNumberSchema = z
  .string()
  .trim()
  .min(1, 'Vehicle registration is required')
  .transform((v, ctx) => {
    const n = normaliseRegistration(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a format like TN-09-AB-1234' });
      return z.NEVER;
    }
    return n;
  });

export const carSizeSchema = z.enum(CAR_SIZES as [CarSize, ...CarSize[]], {
  errorMap: () => ({ message: 'Select a car size' }),
});

export const schedulePatternSchema = z.enum(SCHEDULE_PATTERNS as [SchedulePattern, ...SchedulePattern[]]);

export const paymentMethodSchema = z.enum(PAYMENT_METHODS as [PaymentMethod, ...PaymentMethod[]]);
