import { ZodError } from 'zod';

/** A business-rule violation with a stable machine code and a user-safe message. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Converts any thrown value into a message safe to show to end users. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? 'Some details are invalid.';
  if (error instanceof Error && error.message) {
    return import.meta.env.DEV ? error.message : 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

export function errorCode(error: unknown): string | null {
  return error instanceof DomainError ? error.code : null;
}
