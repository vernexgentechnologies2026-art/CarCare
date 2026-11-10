import type { IAuthService } from '@/services/interfaces';
import { registrationSchema, type RegistrationInput } from '@/schemas';
import type { DemoAccount, Session } from '@/types';
import { DomainError } from '@/utils/errors';
import { normalisePhone } from '@/utils/normalisers';
import type { Backend } from './backend';
import { carSizeCodec } from './mappers';

export class SupabaseAuthService implements IAuthService {
  constructor(private readonly backend: Backend) {}

  /** Re-reads the profile each time, so a resident's approval status is current. */
  async getSession(): Promise<Session | null> {
    if (!(await this.backend.auth.hasSession())) return null;
    return this.backend.rpc<Session | null>('get_my_session');
  }

  async login(phone: string, password: string): Promise<Session> {
    await this.backend.auth.signIn(normalisePhone(phone), password);
    const session = await this.backend.rpc<Session | null>('get_my_session');
    if (!session) {
      // Auth user without a CarCare profile (e.g. an abandoned sign-up).
      await this.backend.auth.signOut();
      throw new DomainError('INVALID_CREDENTIALS', 'Phone number or password is incorrect.');
    }
    return session;
  }

  async logout(): Promise<void> {
    await this.backend.auth.signOut();
  }

  /** Creates the auth user and a PENDING_APPROVAL customer, then signs out again. */
  async registerCustomer(input: RegistrationInput): Promise<{ customerId: string }> {
    const v = registrationSchema.parse(input);
    const phone = normalisePhone(v.phone);
    try {
      await this.backend.auth.signUp(phone, v.password);
    } catch (error) {
      // A previous attempt may have created the auth user but not the profile.
      if (!(error instanceof DomainError && error.code === 'ALREADY_REGISTERED')) throw error;
      await this.backend.auth.signIn(phone, v.password);
      if (await this.backend.rpc<Session | null>('get_my_session')) {
        await this.backend.auth.signOut();
        throw new DomainError('ALREADY_REGISTERED', 'This mobile number is already registered. Sign in instead.');
      }
    }
    try {
      const customerId = await this.backend.rpc<string>('register_customer', {
        p_full_name: v.name,
        p_phone: phone,
        p_block: v.block,
        p_flat: v.flat,
        p_registration: v.registration,
        p_car_size: carSizeCodec.toDb(v.carSize),
        p_make_model: v.makeModel,
        p_color: null,
        p_parking_slot: v.parkingSlot,
      });
      return { customerId };
    } finally {
      await this.backend.auth.signOut();
    }
  }

  /** Demo personas exist only in the mock layer. */
  async getDemoAccounts(): Promise<DemoAccount[]> {
    return [];
  }
}
