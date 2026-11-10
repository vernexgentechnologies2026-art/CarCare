import { z } from 'zod';
import { carSizeSchema, schedulePatternSchema } from './common';

export const packageSchema = z.object({
  name: z.string().trim().min(3, 'Name is too short').max(60),
  carSizes: z.array(carSizeSchema).min(1, 'Select at least one compatible car size'),
  schedulePattern: schedulePatternSchema,
  monthlyPrice: z.coerce
    .number({ invalid_type_error: 'Enter a price' })
    .int('Whole rupees only')
    .min(1, 'Price must be greater than zero')
    .max(100_000, 'Price looks too high'),
  description: z.string().trim().max(200, 'Keep the description under 200 characters'),
  features: z.array(z.string().trim().min(2).max(80)).max(8, 'Up to 8 features'),
  active: z.boolean(),
});
export type PackageInput = z.input<typeof packageSchema>;
export type PackageValues = z.output<typeof packageSchema>;
