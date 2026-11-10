import type { RegistrationInput } from '@/schemas';
import type { DemoAccount, Session } from '@/types';

export interface IAuthService {
  /** Current session, re-read so a resident's approval status is up to date. */
  getSession(): Promise<Session | null>;
  /** Residents awaiting approval (or rejected) can sign in; routing holds them on the status screen. */
  login(phone: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  /** Creates a customer in PENDING_APPROVAL status. Does not sign in. */
  registerCustomer(input: RegistrationInput): Promise<{ customerId: string }>;
  /** Reviewer convenience accounts. Production implementations return []. */
  getDemoAccounts(): Promise<DemoAccount[]>;
}
