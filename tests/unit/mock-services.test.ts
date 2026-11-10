/**
 * Behaviour contract for the service layer. Phase 5 should run these same
 * scenarios against the Supabase implementation.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ADMIN_PHONE, DEMO_CLEANER_PHONE, DEMO_CUSTOMER_PHONE, DEMO_PASSWORD, DEMO_PENDING_CUSTOMER_PHONE } from '@/mock-data';
import { createMockServices, type MockServiceRegistry } from '@/services/mock';
import { addDays } from '@/utils/dates';

// Wednesday — the demo resident's MON_WED_FRI vehicle (veh_1) is due today.
const START = '2026-11-11';
let today = START;
const photo = () => new File([new Uint8Array(110 * 1024)], 'after.webp', { type: 'image/webp' });

let svc: MockServiceRegistry;
beforeEach(() => {
  today = START;
  svc = createMockServices({ today: () => today, latency: { min: 0, max: 0 }, persist: false });
});

const asAdmin = () => svc.auth.login(DEMO_ADMIN_PHONE, DEMO_PASSWORD);
const asCleaner = () => svc.auth.login(DEMO_CLEANER_PHONE, DEMO_PASSWORD);
const asCustomer = () => svc.auth.login(DEMO_CUSTOMER_PHONE, DEMO_PASSWORD);
const jobIdFor = (vehicleId: string, date = today, makeup = false) => `${vehicleId}_${date}${makeup ? '_R' : ''}`;
const progress = async () => {
  await asCustomer();
  return svc.washes.getProgress('veh_1', '2026-11');
};

describe('seed & pagination', () => {
  it('models ~1,500 vehicles and paginates every list', async () => {
    await asAdmin();
    const stats = await svc.admin.getDashboard(today);
    expect(stats.activeVehicles).toBeGreaterThan(1400);
    const page = await svc.customers.list({ page: 1, limit: 25 });
    expect(page.items).toHaveLength(25);
    expect(page.total).toBe(1200);
    expect(page.hasMore).toBe(true);
    const clamped = await svc.customers.list({ page: 1, limit: 5000 });
    expect(clamped.limit).toBe(100);
    const last = await svc.customers.list({ page: 999, limit: 100 });
    expect(last.hasMore).toBe(false);
  });
});

describe('rule 1 & 3 — completion requires a photo; only COMPLETED counts', () => {
  it('rejects completion without a photo', async () => {
    await asCleaner();
    await expect(svc.washes.completeWash({ jobId: jobIdFor('veh_1'), photo: new Blob([], { type: 'image/jpeg' }) })).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' });
  });

  it('a photo-verified wash increments progress by exactly one', async () => {
    const before = await progress();
    await asCleaner();
    const done = await svc.washes.completeWash({ jobId: jobIdFor('veh_1'), photo: photo() });
    expect(done.status).toBe('COMPLETED');
    await expect(svc.washes.completeWash({ jobId: jobIdFor('veh_1'), photo: photo() })).rejects.toMatchObject({ code: 'ALREADY_RECORDED' });
    expect((await progress()).completed).toBe(before.completed + 1);
  });
});

describe('rule 2 — vehicle not present', () => {
  it('closes the job, never counts, and writes an audit record', async () => {
    const before = await progress();
    await asCleaner();
    const job = await svc.washes.markVehicleNotPresent({ jobId: jobIdFor('veh_1'), note: 'Slot empty' });
    expect(job.status).toBe('VEHICLE_NOT_PRESENT');
    await expect(svc.washes.completeWash({ jobId: job.id, photo: photo() })).rejects.toMatchObject({ code: 'ALREADY_RECORDED' });
    const after = await progress();
    expect(after.completed).toBe(before.completed);
    expect(after.vehicleNotPresent).toBe(before.vehicleNotPresent + 1);
    await asAdmin();
    const log = await svc.admin.listAuditLog({ page: 1, limit: 5, action: 'VEHICLE_NOT_PRESENT' });
    expect(log.items[0]?.actorRole).toBe('CLEANER');
    expect(log.items[0]?.summary).toMatch(/manager review/);
  });
});

describe('rule 4 — customer scope isolation', () => {
  it('blocks other residents’ data and admin operations', async () => {
    await asCustomer();
    await expect(svc.payments.listInvoices({ customerId: 'cus_2', page: 1, limit: 5 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.washes.getCustomerHistory({ vehicleId: 'veh_3', page: 1, limit: 5 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.customers.getById('cus_2')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.customers.list({ page: 1, limit: 5 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.washes.listPhotos({ page: 1, limit: 5, from: '2026-11-01', to: today })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('rule 5 — cleaner scope isolation', () => {
  it('limits a cleaner to their own jobs and customers', async () => {
    await asAdmin();
    const othersJob = (await svc.washes.getCleanerJobs({ cleanerId: 'cl_2', date: today, page: 1, limit: 1 })).items[0];
    if (!othersJob) throw new Error('expected a job for cl_2');
    const s = await asCleaner();
    await expect(svc.washes.getJob(othersJob.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.washes.getCleanerJobs({ cleanerId: 'cl_2', date: today, page: 1, limit: 5 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.cleaners.listAssignedCustomers({ cleanerId: 'cl_2', page: 1, limit: 5 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const mine = await svc.cleaners.listAssignedCustomers({ cleanerId: s.cleanerId ?? '', page: 1, limit: 100 });
    expect(mine.items.every((c) => c.block === 'A')).toBe(true);
    const jobs = await svc.washes.getCleanerJobs({ cleanerId: s.cleanerId ?? '', date: today, page: 1, limit: 100 });
    const summary = await svc.washes.getJobSummary(s.cleanerId ?? '', today);
    expect(jobs.total).toBe(summary.total);
    expect(summary.pending).toBe(summary.total); // demo cleaner hasn't started
  });
});

describe('rule 6 — admin oversight', () => {
  it('sees all blocks, photos with cleaner metadata, and the full ledger', async () => {
    await asAdmin();
    const photos = await svc.washes.listPhotos({ page: 1, limit: 10, from: '2026-11-01', to: today });
    expect(photos.total).toBeGreaterThan(1000);
    expect(photos.items[0]?.cleanerName).toBeTruthy();
    expect(photos.items[0]?.recordedAt).toMatch(/T/);
    const invoices = await svc.payments.listAllInvoices({ page: 1, limit: 10, status: 'OVERDUE' });
    expect(invoices.items.every((i) => i.status === 'OVERDUE')).toBe(true);
    const workload = await svc.cleaners.getWorkload(today, { page: 1, limit: 100 });
    expect(new Set(workload.items.flatMap((w) => Object.keys(w.vehiclesByBlock)))).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']));
  });
});

describe('rule 7 — customers see dates only, never cleaner identity', () => {
  it('strips times and cleaner details', async () => {
    await asCustomer();
    const history = await svc.washes.getCustomerHistory({ vehicleId: 'veh_1', page: 1, limit: 50 });
    expect(history.items.length).toBeGreaterThan(0);
    for (const e of history.items) expect(Object.keys(e).sort()).toEqual(['date', 'photoId', 'status']);
    const me = await svc.customers.getById('cus_1');
    for (const v of me.vehicles) {
      expect(v.cleaner).toBeNull();
      expect(v.cleanerId).toBeNull();
    }
  });
});

describe('rule 8 — reschedule progress integrity', () => {
  it('request and approval never add progress; only the photo-verified makeup wash does', async () => {
    await asCleaner();
    await svc.washes.markVehicleNotPresent({ jobId: jobIdFor('veh_1'), note: '' });
    const base = await progress();

    await asCustomer();
    const missed = await svc.washes.getReschedulableMisses('veh_1', { page: 1, limit: 10 });
    expect(missed.items).toContain(START);
    const tomorrow = addDays(START, 1);
    const req = await svc.schedules.createReschedule('veh_1', { missedDate: START, requestedDate: tomorrow, reason: 'Travelling' });
    expect((await progress()).completed).toBe(base.completed);

    await asAdmin();
    await svc.schedules.resolveReschedule(req.id, 'APPROVED', null);
    expect((await progress()).completed).toBe(base.completed);
    const history = await svc.washes.getCustomerHistory({ vehicleId: 'veh_1', cycle: '2026-11', page: 1, limit: 50 });
    expect(history.items.find((e) => e.date === START)?.status).toBe('RESCHEDULED');

    today = tomorrow; // the makeup day (Thursday — not a regular MWF day)
    await asCleaner();
    const job = await svc.washes.getJob(jobIdFor('veh_1', tomorrow, true));
    expect(job.isReschedule).toBe(true);
    await svc.washes.completeWash({ jobId: job.id, photo: photo() });
    expect((await progress()).completed).toBe(base.completed + 1);
  });
});

describe('rule 9 — simulated payments', () => {
  it('marks every transaction as a mock and honours the simulated outcome', async () => {
    const s = await asCustomer();
    const customerId = s.customerId ?? '';
    const before = await svc.payments.getAccountSummary(customerId);
    const due = (await svc.payments.listInvoices({ customerId, page: 1, limit: 10 })).items.find((i) => i.status !== 'PAID');
    if (!due) throw new Error('expected an unpaid invoice');

    const failed = await svc.payments.payInvoice({ invoiceId: due.id, method: 'CARD', mockOutcome: 'FAILURE' });
    expect(failed).toMatchObject({ status: 'FAILED', simulated: true });
    expect(failed.reference).toMatch(/^MOCK-/);
    expect((await svc.payments.getAccountSummary(customerId)).outstanding).toBe(before.outstanding);

    const ok = await svc.payments.payInvoice({ invoiceId: due.id, method: 'UPI', upiId: 'arjun@okbank', mockOutcome: 'SUCCESS' });
    expect(ok).toMatchObject({ status: 'SUCCESS', simulated: true });
    expect((await svc.payments.getAccountSummary(customerId)).outstanding).toBe(before.outstanding - due.amount);
  });
});

describe('registration → approval → package selection', () => {
  it('lets a pending resident sign in to the status screen, then choose a compatible package once approved', async () => {
    const pending = await svc.auth.login(DEMO_PENDING_CUSTOMER_PHONE, DEMO_PASSWORD);
    expect(pending.customerStatus).toBe('PENDING_APPROVAL');
    const me = await svc.customers.getById(pending.customerId ?? '');
    const vehicle = me.vehicles[0];
    if (!vehicle) throw new Error('expected a vehicle');
    expect(vehicle.packageId).toBeNull();
    await expect(svc.customers.selectPackage(vehicle.id, 'pkg_mwf_small')).rejects.toMatchObject({ code: 'NOT_APPROVED' });

    await asAdmin();
    await svc.customers.approve(pending.customerId ?? '', 'cl_21');
    await svc.auth.login(DEMO_PENDING_CUSTOMER_PHONE, DEMO_PASSWORD);
    expect((await svc.auth.getSession())?.customerStatus).toBe('ACTIVE');

    const options = await svc.packages.list({ page: 1, limit: 20, carSize: vehicle.carSize });
    expect(options.items.length).toBe(4);
    expect(options.items.every((p) => p.carSizes.includes(vehicle.carSize))).toBe(true);
    const wrong = vehicle.carSize === 'HATCHBACK' || vehicle.carSize === 'SEDAN' ? 'pkg_mwf_suv' : 'pkg_mwf_small';
    await expect(svc.customers.selectPackage(vehicle.id, wrong)).rejects.toMatchObject({ code: 'PACKAGE_MISMATCH' });
    await svc.customers.selectPackage(vehicle.id, options.items[0]?.id ?? '');
    expect((await svc.customers.getById(pending.customerId ?? '')).vehicles[0]?.packageId).toBe(options.items[0]?.id);
  });
});

describe('admin operations', () => {
  it('reassigns a block route, overrides an invoice, and toggles size compatibility — all audited', async () => {
    await asAdmin();
    const { moved } = await svc.cleaners.reassign({ fromCleanerId: 'cl_1', toCleanerId: 'cl_2', block: 'A' });
    expect(moved).toBeGreaterThan(0);
    const invoice = (await svc.payments.listAllInvoices({ page: 1, limit: 1, status: 'OVERDUE' })).items[0];
    if (!invoice) throw new Error('expected an overdue invoice');
    expect((await svc.payments.overrideInvoiceStatus({ invoiceId: invoice.id, status: 'PAID', note: 'Cash at office' })).status).toBe('PAID');
    await expect(svc.packages.setCarSizeCompatibility('pkg_mwf_small', 'SEDAN', false)).rejects.toMatchObject({ code: 'SIZE_IN_USE' });
    const toggled = await svc.packages.setCarSizeCompatibility('pkg_mwf_small', 'COMPACT_SUV', true);
    expect(toggled.carSizes).toContain('COMPACT_SUV');
    const actions = (await svc.admin.listAuditLog({ page: 1, limit: 10 })).items.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['CLEANER_REASSIGNED', 'INVOICE_OVERRIDDEN', 'PACKAGE_UPDATED']));
    const notes = await svc.admin.listNotifications({ page: 1, limit: 50 });
    expect(notes.items.some((n) => n.kind === 'APPROVAL')).toBe(true);
  });

  it('summarises wash ranges without exposing rows', async () => {
    await asAdmin();
    const s = await svc.washes.getWashSummary({ from: '2026-11-01', to: today });
    expect(s.scheduled).toBe(s.completed + s.vehicleNotPresent + s.pending);
    expect(s.completionRate).toBeGreaterThan(80);
    await expect(svc.washes.getWashSummary({ from: '2026-01-01', to: today })).rejects.toMatchObject({ code: 'RANGE_TOO_LARGE' });
  });
});
