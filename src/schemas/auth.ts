import { z } from 'zod';
import { BLOCKS } from '@/constants';
import { carSizeSchema, phoneSchema, registrationNumberSchema } from './common';

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.input<typeof loginSchema>;
export type LoginValues = z.output<typeof loginSchema>;

/**
 * Resident registration. The package is chosen after approval
 * (`/customer/packages`), so it is not collected here.
 */
export const registrationSchema = z.object({
  name: z.string().trim().min(2, 'Enter the owner’s full name').max(80, 'Name is too long'),
  phone: phoneSchema,
  registration: registrationNumberSchema,
  makeModel: z.string().trim().min(2, 'Enter the car make and model').max(60),
  carSize: carSizeSchema,
  block: z.string().refine((v) => BLOCKS.includes(v), 'Select your block'),
  flat: z.string().trim().regex(/^\d{3,4}$/, 'Enter a flat number like 302'),
  parkingSlot: z
    .string()
    .trim()
    .min(2, 'Enter your parking slot')
    .max(20, 'Parking slot is too long')
    .regex(/^[A-Za-z0-9 -]+$/, 'Use letters, numbers and dashes only, e.g. B1-A-045'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/\d/, 'Include at least one number'),
});
export type RegistrationInput = z.input<typeof registrationSchema>;
export type RegistrationValues = z.output<typeof registrationSchema>;

export const rejectSchema = z.object({
  reason: z.string().trim().min(5, 'Give the resident a short reason').max(200),
});
export type RejectValues = z.output<typeof rejectSchema>;
