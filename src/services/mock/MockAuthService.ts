import {
  DEMO_ADMIN_PHONE,
  DEMO_CLEANER_PHONE,
  DEMO_CUSTOMER_PHONE,
  DEMO_PASSWORD,
  DEMO_PENDING_CUSTOMER_PHONE,
  SOCIETY_ADDRESS,
  type MockAccount,
} from '@/mock-data';
import { registrationSchema, type RegistrationInput } from '@/schemas';
import type { IAuthService } from '@/services/interfaces';
import type { DemoAccount, Session } from '@/types';
import { DomainError } from '@/utils/errors';
import { normalisePhone } from '@/utils/normalisers';
import { audit, respond, type MockContext } from './runtime';

export class MockAuthService implements IAuthService {
  constructor(private readonly ctx: MockContext) {}

  private toSession(account: MockAccount): Session {
    const customer = account.customerId ? this.ctx.store.data.customers.find((c) => c.id === account.customerId) : undefined;
    return {
      userId: account.id,
      role: account.role,
      displayName: account.displayName,
      phone: account.phone,
      customerId: account.customerId,
      cleanerId: account.cleanerId,
      customerStatus: customer?.status ?? null,
    };
  }

  getSession(): Promise<Session | null> {
    return respond({ ...this.ctx, latency: { min: 0, max: 0 } }, () => {
      const stored = this.ctx.store.getSession();
      if (!stored) return null;
      const account = this.ctx.store.data.accounts.find((a) => a.id === stored.userId);
      if (!account) {
        this.ctx.store.setSession(null);
        return null;
      }
      // Re-derive so an approval made since sign-in takes effect on refresh.
      const fresh = this.toSession(account);
      this.ctx.store.setSession(fresh);
      return fresh;
    });
  }

  login(phone: string, password: string): Promise<Session> {
    return respond(this.ctx, () => {
      const account = this.ctx.store.data.accounts.find((a) => a.phone === normalisePhone(phone));
      if (!account || account.password !== password) {
        throw new DomainError('INVALID_CREDENTIALS', 'Phone number or password is incorrect.');
      }
      const session = this.toSession(account);
      this.ctx.store.setSession(session);
      audit(this.ctx, 'SIGNED_IN', 'SESSION', account.id, `${account.displayName} signed in`, session);
      this.ctx.store.commit();
      return session;
    });
  }

  logout(): Promise<void> {
    return respond({ ...this.ctx, latency: { min: 0, max: 0 } }, () => {
      this.ctx.store.setSession(null);
    });
  }

  registerCustomer(input: RegistrationInput): Promise<{ customerId: string }> {
    return respond(this.ctx, () => {
      const v = registrationSchema.parse(input);
      const { accounts, customers, vehicles } = this.ctx.store.data;
      if (accounts.some((a) => a.phone === v.phone)) {
        throw new DomainError('PHONE_TAKEN', 'This phone number is already registered. Try signing in instead.');
      }
      if (vehicles.some((x) => x.registration === v.registration)) {
        throw new DomainError('VEHICLE_TAKEN', 'This vehicle is already registered with CarCare.');
      }
      const customerId = this.ctx.store.nextId('cus');
      customers.push({
        id: customerId,
        name: v.name,
        phone: v.phone,
        block: v.block,
        flat: v.flat,
        address: SOCIETY_ADDRESS,
        status: 'PENDING_APPROVAL',
        createdAt: new Date().toISOString(),
        rejectionReason: null,
      });
      vehicles.push({
        id: this.ctx.store.nextId('veh'),
        customerId,
        registration: v.registration,
        carSize: v.carSize,
        makeModel: v.makeModel,
        color: 'Not specified',
        packageId: null,
        cleanerId: null,
        parkingSlot: v.parkingSlot.toUpperCase(),
        timeRestriction: null,
        instructions: null,
      });
      const accountId = this.ctx.store.nextId('acc');
      accounts.push({ id: accountId, role: 'CUSTOMER', phone: v.phone, password: v.password, displayName: v.name, customerId, cleanerId: null });
      audit(this.ctx, 'REGISTRATION_SUBMITTED', 'CUSTOMER', customerId, `${v.name} registered ${v.registration} for ${v.block}-${v.flat}`, {
        userId: accountId,
        displayName: v.name,
        role: 'CUSTOMER',
      });
      this.ctx.store.commit();
      return { customerId };
    });
  }

  getDemoAccounts(): Promise<DemoAccount[]> {
    return Promise.resolve([
      { persona: 'CUSTOMER_APPROVED', role: 'CUSTOMER', label: 'Arjun Raghavan · A-101', phone: DEMO_CUSTOMER_PHONE, password: DEMO_PASSWORD },
      { persona: 'CUSTOMER_PENDING', role: 'CUSTOMER', label: 'Meera Subramanian · awaiting approval', phone: DEMO_PENDING_CUSTOMER_PHONE, password: DEMO_PASSWORD },
      { persona: 'CLEANER', role: 'CLEANER', label: 'Murugan S · Block A', phone: DEMO_CLEANER_PHONE, password: DEMO_PASSWORD },
      { persona: 'ADMIN', role: 'ADMIN', label: 'Facility Admin', phone: DEMO_ADMIN_PHONE, password: DEMO_PASSWORD },
    ]);
  }
}
