/** Mock sign-in accounts. Phase 5 replaces these with Supabase Auth users. */
import type { Role } from '@/types';

export interface MockAccount {
  id: string;
  role: Role;
  phone: string;
  /** Mock only — Phase 5 uses Supabase Auth with hashed credentials. */
  password: string;
  displayName: string;
  customerId: string | null;
  cleanerId: string | null;
}

/** Shared password for reviewer demo accounts. Mock layer only — not a credential. */
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ADMIN_PHONE = '9000000001';
export const DEMO_CLEANER_PHONE = '9000000101';
export const DEMO_CUSTOMER_PHONE = '9000001001';
/** Resident whose registration is still awaiting approval. */
export const DEMO_PENDING_CUSTOMER_PHONE = '9000002181';
