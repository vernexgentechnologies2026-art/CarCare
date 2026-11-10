import { DomainError } from '@/utils/errors';

/** The subset of a PostgREST / Storage error this adapter relies on. */
export interface SupabaseErrorLike {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Converts a Supabase error into a DomainError with a user-safe message.
 * Business-rule exceptions raised in SQL (`raise exception ... using errcode = 'P0001'`)
 * keep their message; database internals are never shown to users.
 */
export function toDomainError(error: SupabaseErrorLike): DomainError {
  switch (error.code) {
    case '42501': // insufficient_privilege — RLS denied the row
    case 'PGRST301': // JWT expired / invalid
      return new DomainError('FORBIDDEN', 'You don’t have access to this.');
    case 'PGRST116': // .single() found no row (or RLS hid it)
      return new DomainError('NOT_FOUND', 'That record could not be found.');
    case '23505':
      return new DomainError('CONFLICT', 'This already exists.');
    case '23503':
    case '23514':
    case '22P02':
      return new DomainError('INVALID', 'Some details are invalid.');
    case 'P0001':
      return new DomainError('RULE_VIOLATION', error.message);
    default:
      return new DomainError('BACKEND_ERROR', 'Something went wrong. Please try again.');
  }
}

/** Unwraps a Supabase `{ data, error }` result, throwing a DomainError on failure. */
export function unwrap<T>(result: { data: T | null; error: SupabaseErrorLike | null }): T {
  if (result.error) throw toDomainError(result.error);
  if (result.data === null) throw new DomainError('NOT_FOUND', 'That record could not be found.');
  return result.data;
}
