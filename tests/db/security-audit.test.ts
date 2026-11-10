// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ServiceRegistry } from '@/services/interfaces';
import { createSupabaseRegistry } from '@/services/supabase';
import { todayIST } from '@/services/supabase/backend';
import { asAnon, asOwner, createDatabase, rows } from './pglite';
import { PgliteBackend } from './pgliteBackend';

/*
 * Phase 6 security audit (Master Task Document §18, §26.2): IDOR and privilege
 * tests through the same API the browser uses, on migrations 001–005.
 */

const PW = 'test1234';
const today = todayIST();
const cycle = today.slice(0, 7);
const page = { page: 1, limit: 20 };
const plus = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const P = { admin: '9000000001', x: '9000000101', y: '9000000102', a: '9000001001', b: '9000001002', pending: '9000002001', paused: '9000003001' };
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = { admin: uid(1), x: uid(2), y: uid(3), a: uid(4), b: uid(5), pending: uid(6), paused: uid(7) };
const ID = {
  cleanerX: uid(101), cleanerY: uid(102),
  custA: uid(201), custB: uid(202), custPending: uid(203), custPaused: uid(204),
  vehA: uid(301), vehB: uid(302), vehPending: uid(303), vehPaused: uid(304),
  pkg: uid(401), subA: uid(501), subB: uid(502), subPaused: uid(504),
  invA: uid(601), invB: uid(602),
  jobA: uid(701), jobB: uid(702), missedB: uid(703),
};

let db: PGlite;
let svc: ServiceRegistry;
let photoB = '';
const as = (who: keyof typeof P) => svc.auth.login(P[who], PW);
const forbidden = { code: 'FORBIDDEN' };

beforeAll(async () => {
  db = await createDatabase();
  const backend = new PgliteBackend(db);
  svc = createSupabaseRegistry(backend, () => today);
  for (const who of Object.keys(P) as Array<keyof typeof P>) backend.addAccount(P[who], U[who], PW);
  await asOwner(db);
  await db.exec(`
    insert into auth.users (id, email) select id, phone || '@users.carcare.local' from (values
      ('${U.admin}'::uuid, '${P.admin}'), ('${U.x}', '${P.x}'), ('${U.y}', '${P.y}'), ('${U.a}', '${P.a}'),
      ('${U.b}', '${P.b}'), ('${U.pending}', '${P.pending}'), ('${U.paused}', '${P.paused}')) v(id, phone);
    insert into public.profiles (id, role, full_name, phone) values
      ('${U.admin}', 'admin', 'Admin', '${P.admin}'), ('${U.x}', 'cleaner', 'Cleaner X', '${P.x}'), ('${U.y}', 'cleaner', 'Cleaner Y', '${P.y}'),
      ('${U.a}', 'customer', 'Resident A', '${P.a}'), ('${U.b}', 'customer', 'Resident B', '${P.b}'),
      ('${U.pending}', 'customer', 'Pending P', '${P.pending}'), ('${U.paused}', 'customer', 'Paused Q', '${P.paused}');
    insert into public.cleaners (id, profile_id, assigned_blocks) values ('${ID.cleanerX}', '${U.x}', '{A}'), ('${ID.cleanerY}', '${U.y}', '{B}');
    insert into public.customers (id, profile_id, block, flat, status) values
      ('${ID.custA}', '${U.a}', 'A', '101', 'active'), ('${ID.custB}', '${U.b}', 'B', '201', 'active'),
      ('${ID.custPending}', '${U.pending}', 'A', '102', 'pending_approval'), ('${ID.custPaused}', '${U.paused}', 'A', '103', 'paused');
    insert into public.vehicles (id, customer_id, cleaner_id, registration, car_size, make_model, parking_slot) values
      ('${ID.vehA}', '${ID.custA}', '${ID.cleanerX}', 'TN-01-AA-0001', 'sedan', 'Car A', 'A-1'),
      ('${ID.vehB}', '${ID.custB}', '${ID.cleanerY}', 'TN-01-BB-0002', 'sedan', 'Car B', 'B-1'),
      ('${ID.vehPending}', '${ID.custPending}', null, 'TN-01-PP-0003', 'sedan', 'Car P', 'A-2'),
      ('${ID.vehPaused}', '${ID.custPaused}', '${ID.cleanerX}', 'TN-01-QQ-0004', 'sedan', 'Car Q', 'A-3');
    insert into public.packages (id, name, schedule_pattern, car_sizes, monthly_price_paise) values ('${ID.pkg}', 'Plan', 'daily', '{sedan}', 10000);
    insert into public.subscriptions (id, vehicle_id, package_id, starts_on) values
      ('${ID.subA}', '${ID.vehA}', '${ID.pkg}', date '${today}' - 10), ('${ID.subB}', '${ID.vehB}', '${ID.pkg}', date '${today}' - 10),
      ('${ID.subPaused}', '${ID.vehPaused}', '${ID.pkg}', date '${today}' - 10);
    insert into public.invoices (id, number, customer_id, subscription_id, cycle_month, issued_on, due_on, amount_paise) values
      ('${ID.invA}', 'INV-A', '${ID.custA}', '${ID.subA}', date_trunc('month', date '${today}'), date_trunc('month', date '${today}'), date '${today}' + 5, 10000),
      ('${ID.invB}', 'INV-B', '${ID.custB}', '${ID.subB}', date_trunc('month', date '${today}'), date_trunc('month', date '${today}'), date '${today}' + 5, 10000);
    insert into public.wash_jobs (id, subscription_id, vehicle_id, cleaner_id, scheduled_date) values
      ('${ID.jobA}', '${ID.subA}', '${ID.vehA}', '${ID.cleanerX}', '${today}'),
      ('${ID.jobB}', '${ID.subB}', '${ID.vehB}', '${ID.cleanerY}', '${today}');
    insert into public.wash_jobs (id, subscription_id, vehicle_id, cleaner_id, scheduled_date, status, recorded_at) values
      ('${ID.missedB}', '${ID.subB}', '${ID.vehB}', '${ID.cleanerY}', date '${today}' - 1, 'vehicle_not_present', now());
  `);
  // Cleaner Y completes B's wash with a photo, so B has a private photo to target.
  await as('y');
  const done = await svc.washes.completeWash({ jobId: ID.jobB, photo: new Blob([new Uint8Array(1000)], { type: 'image/webp' }) });
  photoB = done.record!.photoId!;
}, 60_000);

describe('IDOR — resident A cannot read or modify resident B', () => {
  it('cannot read B’s profile, vehicle, progress, history, photos, invoices or payments', async () => {
    await as('a');
    const attempts: Array<[string, () => Promise<unknown>]> = [
      ['customer detail', () => svc.customers.getById(ID.custB)],
      ['progress', () => svc.washes.getProgress(ID.vehB, cycle)],
      ['history', () => svc.washes.getCustomerHistory({ ...page, vehicleId: ID.vehB })],
      ['misses', () => svc.washes.getReschedulableMisses(ID.vehB, page)],
      ['next wash', () => svc.washes.getNextWashDate(ID.vehB, today)],
      ['photo url', () => svc.washes.getPhotoUrl(photoB)],
      ['invoices', () => svc.payments.listInvoices({ ...page, customerId: ID.custB })],
      ['invoice', () => svc.payments.getInvoice(ID.invB)],
      ['payments', () => svc.payments.listPayments({ ...page, customerId: ID.custB })],
      ['account', () => svc.payments.getAccountSummary(ID.custB)],
      ['reschedules', () => svc.schedules.listReschedulesForCustomer({ ...page, customerId: ID.custB })],
    ];
    for (const [name, attempt] of attempts) await expect(attempt(), name).rejects.toMatchObject(forbidden);
  });

  it('cannot act on B’s vehicle or invoice', async () => {
    await as('a');
    await expect(svc.schedules.createReschedule(ID.vehB, { missedDate: plus(-1), requestedDate: plus(2), reason: 'Not mine' })).rejects.toMatchObject(forbidden);
    await expect(svc.customers.selectPackage(ID.vehB, ID.pkg)).rejects.toThrow(/own car/);
    await expect(svc.payments.payInvoice({ invoiceId: ID.invB, method: 'UPI' })).rejects.toMatchObject(forbidden);
  });
});

describe('IDOR — cleaner X cannot view or update cleaner Y’s jobs', () => {
  it('cannot read Y’s jobs, schedule, targets, residents or photos', async () => {
    await as('x');
    const attempts: Array<[string, () => Promise<unknown>]> = [
      ['jobs', () => svc.washes.getCleanerJobs({ ...page, cleanerId: ID.cleanerY, date: today })],
      ['summary', () => svc.washes.getJobSummary(ID.cleanerY, today)],
      ['job', () => svc.washes.getJob(ID.jobB)],
      ['week', () => svc.cleaners.getWeekSchedule(ID.cleanerY, today, 7)],
      ['month', () => svc.cleaners.getMonthSummary(ID.cleanerY, cycle, today)],
      ['residents', () => svc.cleaners.listAssignedCustomers({ ...page, cleanerId: ID.cleanerY })],
      ['wash summary', () => svc.washes.getWashSummary({ from: today, to: today, cleanerId: ID.cleanerY })],
      ['all-cleaner summary', () => svc.washes.getWashSummary({ from: today, to: today })],
      ['progress of Y’s car', () => svc.washes.getProgress(ID.vehB, cycle)],
      ['Y’s photo', () => svc.washes.getPhotoUrl(photoB)],
      ['resident record', () => svc.customers.getById(ID.custA)],
    ];
    for (const [name, attempt] of attempts) await expect(attempt(), name).rejects.toMatchObject(forbidden);
  });

  it('cannot complete or mark Vehicle Not Present on Y’s job', async () => {
    await as('x');
    const otherJob = uid(799);
    await asOwner(db);
    await db.query(`insert into public.wash_jobs (id, subscription_id, vehicle_id, cleaner_id, scheduled_date, is_makeup) values ($1, $2, $3, $4, $5, true)`, [otherJob, ID.subB, ID.vehB, ID.cleanerY, today]);
    await as('x');
    await expect(svc.washes.completeWash({ jobId: otherJob, photo: new Blob([new Uint8Array(1000)], { type: 'image/webp' }) })).rejects.toMatchObject(forbidden);
    await expect(svc.washes.markVehicleNotPresent({ jobId: otherJob, note: '' })).rejects.toThrow(/not open for you/);
    await asOwner(db);
    expect(await rows(db, `select status from public.wash_jobs where id = $1`, [otherJob])).toEqual([{ status: 'pending' }]);
  });
});

describe('IDOR across roles (the NULL-ownership bug found in this audit)', () => {
  it('a cleaner cannot read any resident’s record, invoices, payments or reschedules', async () => {
    await as('x');
    for (const [name, attempt] of [
      ['detail', () => svc.customers.getById(ID.custA)],
      ['invoices', () => svc.payments.listInvoices({ ...page, customerId: ID.custA })],
      ['invoice', () => svc.payments.getInvoice(ID.invA)],
      ['payments', () => svc.payments.listPayments({ ...page, customerId: ID.custA })],
      ['account', () => svc.payments.getAccountSummary(ID.custA)],
      ['reschedules', () => svc.schedules.listReschedulesForCustomer({ ...page, customerId: ID.custA })],
    ] as Array<[string, () => Promise<unknown>]>) {
      await expect(attempt(), name).rejects.toMatchObject(forbidden);
    }
  });

  it('a resident (or admin-less user) cannot read any cleaner’s jobs, schedule or residents', async () => {
    await as('a');
    for (const [name, attempt] of [
      ['jobs', () => svc.washes.getCleanerJobs({ ...page, cleanerId: ID.cleanerX, date: today })],
      ['summary', () => svc.washes.getJobSummary(ID.cleanerX, today)],
      ['job', () => svc.washes.getJob(ID.jobA)],
      ['week', () => svc.cleaners.getWeekSchedule(ID.cleanerX, today, 7)],
      ['month', () => svc.cleaners.getMonthSummary(ID.cleanerX, cycle, today)],
      ['residents', () => svc.cleaners.listAssignedCustomers({ ...page, cleanerId: ID.cleanerX })],
      ['wash summary', () => svc.washes.getWashSummary({ from: today, to: today, cleanerId: ID.cleanerX })],
    ] as Array<[string, () => Promise<unknown>]>) {
      await expect(attempt(), name).rejects.toMatchObject(forbidden);
    }
  });

  it('no live function uses the NULL-unsafe ownership check', async () => {
    await asOwner(db);
    const unsafe = await rows<{ proname: string }>(
      db,
      String.raw`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private')
          and pg_get_functiondef(p.oid) ~ 'if not \((private\.is_admin\(\)|v_admin) or p_\w+ = private\.current_\w+_id\(\)\)'`,
    );
    expect(unsafe).toEqual([]);
  });
});

describe('unapproved residents cannot book or use features', () => {
  it('a pending resident sees only their status, and cannot choose a package or reschedule', async () => {
    const session = await as('pending');
    expect(session.customerStatus).toBe('PENDING_APPROVAL');
    expect((await svc.customers.getById(ID.custPending)).customer.status).toBe('PENDING_APPROVAL');
    await expect(svc.customers.selectPackage(ID.vehPending, ID.pkg)).rejects.toThrow(/approved resident/);
    await expect(svc.schedules.createReschedule(ID.vehPending, { missedDate: plus(-1), requestedDate: plus(2), reason: 'Try' })).rejects.toMatchObject(forbidden);
    expect(await svc.washes.getNextWashDate(ID.vehPending, today)).toBeNull();
  });

  it('a paused resident cannot choose a package, and gets no jobs generated', async () => {
    await as('paused');
    await expect(svc.customers.selectPackage(ID.vehPaused, ID.pkg)).rejects.toThrow(/approved resident/);
    await as('x');
    const jobs = await svc.washes.getCleanerJobs({ ...page, cleanerId: ID.cleanerX, date: today });
    expect(jobs.items.map((j) => j.vehicle.id)).not.toContain(ID.vehPaused);
  });
});

describe('privilege escalation', () => {
  it('residents and cleaners are refused every admin operation', async () => {
    for (const who of ['a', 'x'] as const) {
      await as(who);
      const attempts: Array<[string, () => Promise<unknown>]> = [
        ['approve', () => svc.customers.approve(ID.custPending, ID.cleanerX)],
        ['set status', () => svc.customers.setStatus(ID.custB, 'PAUSED')],
        ['assign', () => svc.customers.assignCleaner(ID.vehB, ID.cleanerX)],
        ['change package', () => svc.customers.changePackage(ID.vehB, ID.pkg)],
        ['reassign', () => svc.cleaners.reassign({ fromCleanerId: ID.cleanerY, toCleanerId: ID.cleanerX, block: 'ALL' })],
        ['package', () => svc.packages.create({ name: 'Free', carSizes: ['SEDAN'], schedulePattern: 'DAILY', monthlyPrice: 1, description: '', features: [], active: true })],
        ['override', () => svc.payments.overrideInvoiceStatus({ invoiceId: ID.invB, status: 'PAID', note: 'Paid in cash' })],
        ['audit log', () => svc.admin.listAuditLog(page)],
        ['photos', () => svc.washes.listPhotos({ ...page, from: today, to: today })],
        ['dashboard', () => svc.admin.getDashboard(today)],
      ];
      for (const [name, attempt] of attempts) await expect(attempt(), `${who}: ${name}`).rejects.toMatchObject(forbidden);
    }
  });

  it('anonymous callers can execute no function at all', async () => {
    await asOwner(db);
    const anon = await rows(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`);
    expect(anon).toEqual([]);
    await asAnon(db);
    await expect(db.query('select public.get_my_session()')).rejects.toThrow(/permission denied/);
  });

  it('signed-in users can call exactly the vetted function list (no accidental grants)', async () => {
    await asOwner(db);
    const granted = (await rows<{ proname: string }>(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`)).map((r) => r.proname);
    expect(granted).toMatchSnapshot();
    for (const serviceOnly of ['apply_razorpay_payment', 'register_uploaded_photo', 'attach_razorpay_order', 'generate_wash_jobs', 'claim_expired_photos', 'confirm_photos_deleted', 'generate_monthly_invoices']) {
      expect(granted).not.toContain(serviceOnly);
    }
  });

  it('cannot register with someone else’s mobile number', async () => {
    await asOwner(db);
    await db.query(`insert into auth.users (id, email) values ($1, '9000009999@users.carcare.local')`, [uid(999)]);
    const backend = new PgliteBackend(db);
    backend.addAccount('9000009999', uid(999), PW);
    const other = createSupabaseRegistry(backend, () => today);
    await other.auth.login('9000009999', PW).catch(() => undefined); // no profile yet → signed out
    await backend.auth.signIn('9000009999', PW);
    await expect(backend.rpc('register_customer', {
      p_full_name: 'Impostor', p_phone: P.b, p_block: 'A', p_flat: '1', p_registration: 'TN-01-ZZ-9999',
      p_car_size: 'sedan', p_make_model: 'X', p_color: null, p_parking_slot: 'A-9',
    })).rejects.toThrow(/must match/);
  });
});

describe('rule 7 — nothing resident-facing carries cleaner identity or cleaning time', () => {
  it('session, profile, history and reschedules contain no cleaner fields or timestamps of washes', async () => {
    await as('b');
    const payloads = [
      await svc.auth.getSession(),
      await svc.customers.getById(ID.custB),
      await svc.washes.getCustomerHistory({ ...page, vehicleId: ID.vehB }),
    ];
    const text = JSON.stringify(payloads);
    expect(text).not.toMatch(/Cleaner Y/);
    expect(text).not.toContain(ID.cleanerY);
    expect(text).not.toMatch(/recordedAt|uploadedAt/);
    const history = payloads[2] as Awaited<ReturnType<typeof svc.washes.getCustomerHistory>>;
    for (const entry of history.items) {
      expect(Object.keys(entry).sort()).toEqual(['date', 'photoId', 'status']);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
