// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ServiceRegistry } from '@/services/interfaces';
import { createSupabaseRegistry } from '@/services/supabase';
import { todayIST } from '@/services/supabase/backend';
import { createDatabase, asOwner } from './pglite';
import { PgliteBackend } from './pgliteBackend';

/*
 * End-to-end: the real Supabase*Service classes → database functions in
 * migrations 001–004 on PostgreSQL 16, signed in as each role. Fictional data.
 */

const PW = 'test1234';
const PHONE = { admin: '9000000001', cleaner: '9000000101', cleaner2: '9000000102', resident: '9000001001' };
const U = {
  admin: '00000000-0000-4000-8000-0000000000a1',
  cleaner: '00000000-0000-4000-8000-0000000000c1',
  cleaner2: '00000000-0000-4000-8000-0000000000c2',
  resident: '00000000-0000-4000-8000-0000000000d1',
};
const ID = {
  cleaner: '10000000-0000-4000-8000-0000000000c1',
  cleaner2: '10000000-0000-4000-8000-0000000000c2',
  customer: '20000000-0000-4000-8000-0000000000d1',
  vehicle: '30000000-0000-4000-8000-0000000000d1',
  pkg: '40000000-0000-4000-8000-0000000000e1',
  sub: '50000000-0000-4000-8000-0000000000d1',
  invoice: '60000000-0000-4000-8000-0000000000d1',
};

const today = todayIST();
const cycle = today.slice(0, 7);
const page = { page: 1, limit: 20 };
const photo = () => new Blob([new Uint8Array(110 * 1024)], { type: 'image/webp' });

let db: PGlite;
let backend: PgliteBackend;
let svc: ServiceRegistry;
const as = (who: keyof typeof PHONE) => svc.auth.login(PHONE[who], PW);

beforeAll(async () => {
  db = await createDatabase();
  backend = new PgliteBackend(db);
  svc = createSupabaseRegistry(backend, () => today);
  for (const who of Object.keys(PHONE) as Array<keyof typeof PHONE>) backend.addAccount(PHONE[who], U[who], PW);
  await asOwner(db);
  await db.exec(`
    insert into auth.users (id) values ('${U.admin}'), ('${U.cleaner}'), ('${U.cleaner2}'), ('${U.resident}');
    insert into public.profiles (id, role, full_name, phone) values
      ('${U.admin}', 'admin', 'Facility Admin', '${PHONE.admin}'),
      ('${U.cleaner}', 'cleaner', 'Cleaner One', '${PHONE.cleaner}'),
      ('${U.cleaner2}', 'cleaner', 'Cleaner Two', '${PHONE.cleaner2}'),
      ('${U.resident}', 'customer', 'Resident One', '${PHONE.resident}');
    insert into public.cleaners (id, profile_id, assigned_blocks) values ('${ID.cleaner}', '${U.cleaner}', '{A}'), ('${ID.cleaner2}', '${U.cleaner2}', '{B}');
    insert into public.customers (id, profile_id, block, flat, status, approved_at) values ('${ID.customer}', '${U.resident}', 'A', '101', 'active', now());
    insert into public.vehicles (id, customer_id, cleaner_id, registration, car_size, make_model, parking_slot)
      values ('${ID.vehicle}', '${ID.customer}', '${ID.cleaner}', 'TN-09-AB-1234', 'sedan', 'Fictional Sedan', 'A-12');
    insert into public.packages (id, name, schedule_pattern, car_sizes, monthly_price_paise) values ('${ID.pkg}', 'Placeholder Daily', 'daily', '{hatchback,sedan}', 10000);
    insert into public.subscriptions (id, vehicle_id, package_id, starts_on) values ('${ID.sub}', '${ID.vehicle}', '${ID.pkg}', date '${today}' - 20);
    insert into public.invoices (id, number, customer_id, subscription_id, cycle_month, issued_on, due_on, amount_paise)
      values ('${ID.invoice}', 'CC-TEST-00001', '${ID.customer}', '${ID.sub}', date_trunc('month', date '${today}'), date_trunc('month', date '${today}'), date '${today}' + 5, 10000);
    -- a missed wash two days ago (vehicle not present), recorded by the cleaner
    insert into public.wash_jobs (subscription_id, vehicle_id, cleaner_id, scheduled_date, status, recorded_at)
      values ('${ID.sub}', '${ID.vehicle}', '${ID.cleaner}', date '${today}' - 2, 'vehicle_not_present', now());
  `);
}, 60_000);

describe('SupabaseAuthService', () => {
  it('rejects wrong credentials and returns the database session', async () => {
    await expect(svc.auth.login(PHONE.admin, 'wrong')).rejects.toThrow(/incorrect/);
    const session = await as('admin');
    expect(session).toMatchObject({ role: 'ADMIN', displayName: 'Facility Admin', customerId: null, cleanerId: null });
    expect(await svc.auth.getSession()).toEqual(session);
    await svc.auth.logout();
    expect(await svc.auth.getSession()).toBeNull();
    expect(await svc.auth.getDemoAccounts()).toEqual([]);
  });

  it('registers a resident as pending, signed out, who then sees the approval status', async () => {
    const { customerId } = await svc.auth.registerCustomer({
      name: 'New Resident', phone: '9000002001', registration: 'TN10EF9012', makeModel: 'Fictional Hatch',
      carSize: 'HATCHBACK', block: 'A', flat: '302', parkingSlot: 'A-30', password: 'secret123',
    });
    expect(await svc.auth.getSession()).toBeNull();
    const session = await svc.auth.login('9000002001', 'secret123');
    expect(session).toMatchObject({ role: 'CUSTOMER', customerId, customerStatus: 'PENDING_APPROVAL' });
  });
});

describe('SupabaseCustomerService + SupabaseAdminService', () => {
  it('lists pending approvals, approves with a cleaner, and audits it', async () => {
    await as('admin');
    const pending = await svc.customers.list({ ...page, status: 'PENDING_APPROVAL' });
    expect(pending.total).toBe(1);
    const newcomer = pending.items[0]!;
    expect(newcomer.customer.address).toBe('Block A, Flat 302');
    expect(newcomer.vehicle?.registration).toBe('TN-10-EF-9012');
    expect(await svc.customers.countByStatus()).toEqual({ PENDING_APPROVAL: 1, ACTIVE: 1, REJECTED: 0, PAUSED: 0 });

    await svc.customers.approve(newcomer.customer.id, ID.cleaner);
    const detail = await svc.customers.getById(newcomer.customer.id);
    expect(detail.customer.status).toBe('ACTIVE');
    expect(detail.vehicles[0]?.cleaner).toEqual({ id: ID.cleaner, name: 'Cleaner One' });

    const audit = await svc.admin.listAuditLog({ ...page, action: 'REGISTRATION_APPROVED' });
    expect(audit.items[0]).toMatchObject({ actorName: 'Facility Admin', actorRole: 'ADMIN', entityType: 'CUSTOMER' });
  });

  it('serves the dashboard, trend and notifications', async () => {
    await as('admin');
    const dash = await svc.admin.getDashboard(today);
    expect(dash).toMatchObject({ date: today, pendingApprovals: 0, cleanersActive: 2, outstandingInvoices: 1, outstandingAmount: 100 });
    expect(await svc.admin.getDailyTrend(today, 14)).toHaveLength(14);
    expect((await svc.admin.listNotifications(page)).items.every((n) => ['APPROVAL', 'RESCHEDULE', 'OVERDUE'].includes(n.kind))).toBe(true);
  });

  it('rule 7: a resident reading their own record never sees the cleaner', async () => {
    await as('resident');
    const mine = await svc.customers.getById(ID.customer);
    expect(mine.vehicles[0]).toMatchObject({ cleaner: null, cleanerId: null, packageId: ID.pkg });
  });

  it('rule 4: residents and cleaners are refused admin data', async () => {
    await as('resident');
    await expect(svc.customers.list(page)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await as('cleaner');
    await expect(svc.admin.getDashboard(today)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('SupabasePackageService', () => {
  it('filters by car size for residents and enforces compatibility for admins', async () => {
    await as('resident');
    expect((await svc.packages.list({ ...page, carSize: 'SEDAN' })).items.map((p) => p.monthlyPrice)).toEqual([100]);
    expect((await svc.packages.list({ ...page, carSize: 'LARGE_SUV' })).total).toBe(0);
    await expect(svc.packages.create({ name: 'Nope', carSizes: ['SEDAN'], schedulePattern: 'DAILY', monthlyPrice: 1, description: '', features: [], active: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await as('admin');
    const created = await svc.packages.create({ name: 'Placeholder SUV', carSizes: ['COMPACT_SUV'], schedulePattern: 'TUE_FRI', monthlyPrice: 2, description: 'Fictional', features: ['Exterior'], active: true });
    expect(created).toMatchObject({ carSizes: ['COMPACT_SUV'], schedulePattern: 'TUE_FRI', monthlyPrice: 2 });
    expect((await svc.packages.setCarSizeCompatibility(created.id, 'LARGE_SUV', true)).carSizes).toEqual(['COMPACT_SUV', 'LARGE_SUV']);
    await expect(svc.packages.setCarSizeCompatibility(ID.pkg, 'SEDAN', false)).rejects.toThrow(/still use/);
  });
});

describe('SupabaseWashService — cleaner flow', () => {
  let jobId = '';

  it("generates today's jobs on demand and summarises them", async () => {
    await as('cleaner');
    const jobs = await svc.washes.getCleanerJobs({ ...page, cleanerId: ID.cleaner, date: today });
    const mine = jobs.items.find((j) => j.vehicle.id === ID.vehicle);
    expect(mine).toMatchObject({ status: 'PENDING', owner: { name: 'Resident One', block: 'A' }, packageName: 'Placeholder Daily', schedulePattern: 'DAILY', record: null });
    jobId = mine!.id;
    expect((await svc.washes.getJobSummary(ID.cleaner, today)).pending).toBeGreaterThanOrEqual(1);
  });

  it('rule 3: refuses completion without a photo, then completes with one', async () => {
    await as('cleaner');
    await expect(svc.washes.completeWash({ jobId, photo: new Blob([], { type: 'image/webp' }) })).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' });
    const done = await svc.washes.completeWash({ jobId, photo: photo() });
    expect(done.status).toBe('COMPLETED');
    expect(done.record?.photoId).toBeTruthy();
  });

  it('rule 5: another cleaner cannot read the job', async () => {
    await as('cleaner2');
    await expect(svc.washes.getJob(jobId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rule 1: progress counts the completed wash only (not the earlier vehicle-not-present)', async () => {
    await as('resident');
    expect(await svc.washes.getProgress(ID.vehicle, cycle)).toMatchObject({ target: 13, completed: 1, remaining: 12 });
  });

  it('rule 7: the resident gallery carries date, status and photo id only', async () => {
    await as('resident');
    const gallery = await svc.washes.getCustomerHistory({ ...page, vehicleId: ID.vehicle, withPhotosOnly: true });
    expect(gallery.items).toHaveLength(1);
    expect(Object.keys(gallery.items[0]!).sort()).toEqual(['date', 'photoId', 'status']);
    expect(gallery.items[0]!.date).toBe(today);
    expect((await svc.washes.getPhotoUrl(gallery.items[0]!.photoId!)).url).toContain('/v1/objects/');
  });
});

describe('SupabaseScheduleService — rule 8', () => {
  it('a reschedule request and its approval never add progress', async () => {
    await as('resident');
    const missed = await svc.washes.getReschedulableMisses(ID.vehicle, page);
    expect(missed.items).toHaveLength(1);
    const requestedDate = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
    const req = await svc.schedules.createReschedule(ID.vehicle, { missedDate: missed.items[0]!, requestedDate, reason: 'Was travelling' });
    expect(req).toMatchObject({ status: 'REQUESTED', vehicleId: ID.vehicle, missedDate: missed.items[0] });
    expect((await svc.schedules.listReschedulesForCustomer({ ...page, customerId: ID.customer })).total).toBe(1);

    await as('admin');
    const queue = await svc.schedules.listReschedules({ ...page, status: 'REQUESTED' });
    expect(queue.items[0]).toMatchObject({ ownerName: 'Resident One', registration: 'TN-09-AB-1234' });
    await svc.schedules.resolveReschedule(req.id, 'APPROVED', 'OK');

    await as('resident');
    expect((await svc.washes.getProgress(ID.vehicle, cycle)).completed).toBe(1);
    const history = await svc.washes.getCustomerHistory({ ...page, vehicleId: ID.vehicle });
    expect(history.items.map((e) => e.status)).toContain('RESCHEDULED');
    expect(await svc.washes.getNextWashDate(ID.vehicle, today)).not.toBeNull();
  });

  it('builds the master calendar for the whole month', async () => {
    await as('admin');
    const days = await svc.schedules.getMasterCalendar(cycle);
    expect(days[0]!.date).toBe(`${cycle}-01`);
    expect(days.reduce((n, d) => n + d.rescheduled, 0)).toBe(1);
  });
});

describe('SupabaseCleanerService', () => {
  it('serves workload, week schedule, month summary and assigned residents, and reassigns routes', async () => {
    await as('cleaner');
    expect(await svc.cleaners.getWeekSchedule(ID.cleaner, today, 7)).toHaveLength(7);
    const month = await svc.cleaners.getMonthSummary(ID.cleaner, cycle, today);
    expect(month.reduce((n, d) => n + d.completed, 0)).toBe(1);
    const assigned = await svc.cleaners.listAssignedCustomers({ ...page, cleanerId: ID.cleaner });
    expect(assigned.items.map((a) => a.name)).toContain('Resident One');
    await expect(svc.cleaners.getWeekSchedule(ID.cleaner2, today, 7)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await as('admin');
    const workload = await svc.cleaners.getWorkload(today, page);
    expect(workload.items.find((w) => w.cleaner.id === ID.cleaner)).toMatchObject({ vehiclesByBlock: { A: 2 }, completedToday: 1 });
    expect(await svc.cleaners.reassign({ fromCleanerId: ID.cleaner, toCleanerId: ID.cleaner2, block: 'A' })).toEqual({ moved: 2 });
  });
});

describe('SupabasePaymentService', () => {
  it('reports a cancelled checkout without storing it, then credits a paid one once', async () => {
    await as('resident');
    expect(await svc.payments.getAccountSummary(ID.customer)).toMatchObject({ outstanding: 100, lastPayment: null });

    backend.nextCheckout = 'cancelled';
    const cancelled = await svc.payments.payInvoice({ invoiceId: ID.invoice, method: 'UPI' });
    expect(cancelled).toMatchObject({ status: 'FAILED', simulated: false });
    expect((await svc.payments.listPayments({ ...page, customerId: ID.customer })).total).toBe(0);

    backend.nextCheckout = 'paid';
    const paid = await svc.payments.payInvoice({ invoiceId: ID.invoice, method: 'UPI' });
    expect(paid).toMatchObject({ status: 'SUCCESS', amount: 100, method: 'UPI', simulated: false });
    expect((await svc.payments.getInvoice(ID.invoice)).status).toBe('PAID');
    await expect(svc.payments.payInvoice({ invoiceId: ID.invoice, method: 'UPI' })).rejects.toMatchObject({ code: 'ALREADY_PAID' });
  });

  it('gives admins the ledger, collections and an audited override', async () => {
    await as('admin');
    const ledger = await svc.payments.listAllInvoices({ ...page, cycle });
    expect(ledger.items[0]).toMatchObject({ ownerName: 'Resident One', registration: 'TN-09-AB-1234', status: 'PAID' });
    expect(await svc.payments.getCollectionsSummary(cycle)).toMatchObject({ billed: 100, collected: 100, outstanding: 0 });
    const reopened = await svc.payments.overrideInvoiceStatus({ invoiceId: ID.invoice, status: 'DUE', note: 'Bank reversal' });
    expect(reopened).toMatchObject({ status: 'DUE', overrideNote: 'Bank reversal' });
    expect((await svc.admin.listAuditLog({ ...page, action: 'INVOICE_OVERRIDDEN' })).total).toBe(1);
  });
});
