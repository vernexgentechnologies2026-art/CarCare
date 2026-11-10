import { z } from 'zod';
import { paymentMethodSchema } from './common';

export const paymentSchema = z
  .object({
    method: paymentMethodSchema,
    upiId: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.method === 'UPI' && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(v.upiId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['upiId'], message: 'Enter a valid UPI ID, e.g. name@okbank' });
    }
  });
export type PaymentValues = z.output<typeof paymentSchema>;
