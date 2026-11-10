import { z } from 'zod';

export const invoiceOverrideSchema = z.object({
  status: z.enum(['PAID', 'DUE']),
  note: z.string().trim().min(5, 'Record why the status is being changed').max(200),
});
export type InvoiceOverrideValues = z.output<typeof invoiceOverrideSchema>;

export const reassignSchema = z
  .object({
    fromCleanerId: z.string().min(1, 'Select the current cleaner'),
    toCleanerId: z.string().min(1, 'Select the new cleaner'),
    block: z.string().min(1),
  })
  .refine((v) => v.fromCleanerId !== v.toCleanerId, { path: ['toCleanerId'], message: 'Choose a different cleaner' });
export type ReassignValues = z.output<typeof reassignSchema>;
