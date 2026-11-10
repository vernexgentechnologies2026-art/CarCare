// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asOwner, asPolicyProbe, asService, asUser, createDatabase, one, rows } from './pglite';

/*
 * Runs migrations 001–003 on a real PostgreSQL 16 engine (PGlite) and checks
 * the business rules and RLS as each role. All data is fictional.
 */

const U = {
  admin: '00000000-0000-4000-8000-000000000001',
  cleaner: '00000000-0000-4000-8000-000000000002',
  cleaner2: '00000000-0000-4000-8000-000000000003',
  custA: '00000000-0000-4000-8000-000000000004',
  custB: '00000000-0000-4000-8000-000000000005',
  newbie: '00000000-0000-4000-8000-000000000006',
};
const ID = {
  cleaner: '10000000-0000-4000-8000-000000000001',
  cleaner2: '10000000-0000-4000-8000-000000000002',
  custA: '20000000-0000-4000-8000-000000000001',
  custB: '20000000-0000-4000-8000-000000000002',
  vehA: '30000000-0000-4000-8000-000000000001',
  vehB: '30000000-0000-4000-8000-000000000002',
  pkg: '40000000-0000-4000-8000-000000000001',
  subA: '50000000-0000-4000-8000-000000000001',
  subB: '50000000-0000-4000-8000-000000000002',
  invA: '60000000-0000-4000-8000-000000000001',
};
const CYCLE = '2026-01-01';

let db: PGlite;

/** Adds a job for vehicle A in January 2026 and returns its id. */
async function addJob(date: string, subscription = ID.subA, vehicle = ID.vehA, cleaner = ID.cleaner): Promise<string> {
  await asOwner(db);
  const { id } = await one<{ id: string }>(
    db,
    `insert into public.wash_jobs (subscription_id, vehicle_id, cleaner_id, scheduled_date) values ($1, $2, $3, $4) returning id`,
    [subscription, vehicle, cleaner, date],
  );
  return id;
}

/** The real upload path: authorise as the cleaner, register as the Worker. */
async function uploadPhoto(jobId: string, cleanerUser = U.cleaner): Promise<string> {
  await asUser(db, cleanerUser);
  const { key } = await one<{ key: string }>(db, `select public.authorize_photo_upload($1) as key`, [jobId]);
  await asService(db);
  const { id } = await one<{ id: string }>(db, `select public.register_uploaded_photo($1, $2, 'image/webp', 120000) as id`, [jobId, key]);
  return id;
}

async function progress(user: string, sub = ID.subA) {
  await asUser(db, user);
  return one<{ completed: number; vehicle_not_present: number; remaining: number; percent: number; target: number }>(
    db,
    `select * from public.get_subscription_wash_progress($1, $2)`,
    [sub, CYCLE],
  );
}

beforeAll(async () => {
  db = await createDatabase();
  await db.exec(`
    insert into auth.users (id) values ('${U.admin}'), ('${U.cleaner}'), ('${U.cleaner2}'), ('${U.custA}'), ('${U.custB}');
    insert into auth.users (id, email) values ('${U.newbie}', '9000002001@users.carcare.local');
    insert into public.profiles (id, role, full_name, phone) values
      ('${U.admin}', 'admin', 'Facility Admin', '9000000001'),
      ('${U.cleaner}', 'cleaner', 'Cleaner One', '9000000101'),
      ('${U.cleaner2}', 'cleaner', 'Cleaner Two', '9000000102'),
      ('${U.custA}', 'customer', 'Resident A', '9000001001'),
      ('${U.custB}', 'customer', 'Resident B', '9000001002');
    insert into public.cleaners (id, profile_id, assigned_blocks) values
      ('${ID.cleaner}', '${U.cleaner}', '{A}'), ('${ID.cleaner2}', '${U.cleaner2}', '{B}');
    insert into public.customers (id, profile_id, block, flat, status) values
      ('${ID.custA}', '${U.custA}', 'A', '101', 'active'), ('${ID.custB}', '${U.custB}', 'B', '201', 'active');
    insert into public.vehicles (id, customer_id, cleaner_id, registration, car_size, make_model, parking_slot) values
      ('${ID.vehA}', '${ID.custA}', '${ID.cleaner}', 'TN-09-AB-1234', 'sedan', 'Fictional Sedan', 'A-12'),
      ('${ID.vehB}', '${ID.custB}', '${ID.cleaner2}', 'TN-09-CD-5678', 'hatchback', 'Fictional Hatch', 'B-03');
    insert into public.packages (id, name, schedule_pattern, car_sizes, monthly_price_paise) values
      ('${ID.pkg}', 'Placeholder Plan', 'mon_wed_fri', '{hatchback,sedan}', 100);
    insert into public.subscriptions (id, vehicle_id, package_id, starts_on) values
      ('${ID.subA}', '${ID.vehA}', '${ID.pkg}', '2026-01-01'), ('${ID.subB}', '${ID.vehB}', '${ID.pkg}', '2026-01-01');
    insert into public.invoices (id, number, customer_id, subscription_id, cycle_month, issued_on, due_on, amount_paise) values
      ('${ID.invA}', 'INV-TEST-0001', '${ID.custA}', '${ID.subA}', '2026-01-01', '2026-01-01', '2026-01-10', 100);
  `);
}, 60_000);

describe('schema', () => {
  it('creates the 11 domain tables plus the audit log, all with RLS and at least one policy', async () => {
    await asOwner(db);
    const tables = await rows<{ relname: string; relrowsecurity: boolean; policies: number }>(
      db,
      `select c.relname, c.relrowsecurity,
              (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(tables.map((t) => t.relname)).toEqual([
      'audit_log', 'cleaners', 'customers', 'invoices', 'packages', 'payments', 'profiles',
      'reschedule_requests', 'subscriptions', 'vehicles', 'wash_jobs', 'wash_photos',
    ]);
    for (const t of tables) {
      expect(t.relrowsecurity, `${t.relname} has RLS`).toBe(true);
      expect(t.policies, `${t.relname} has a policy`).toBeGreaterThan(0);
    }
  });

  it('gives the anonymous role no access at all', async () => {
    await asAnon(db);
    await expect(db.query('select * from public.packages')).rejects.toThrow(/permission denied/);
    await expect(db.query(`select public.get_subscription_wash_progress('${ID.subA}')`)).rejects.toThrow(/permission denied/);
  });

  it('keeps service-only functions away from signed-in users', async () => {
    await asUser(db, U.custA);
    for (const call of [
      `select public.apply_razorpay_payment('o', 'p', 100)`,
      `select public.register_uploaded_photo('${ID.subA}', 'k', 'image/webp', 1)`,
      `select public.generate_wash_jobs(current_date)`,
      `select * from public.claim_expired_photos()`,
    ]) {
      await expect(db.query(call), call).rejects.toThrow(/permission denied/);
    }
  });
});

describe('rule 1 — get_subscription_wash_progress counts status = completed only', () => {
  it('ignores vehicle-not-present and pending jobs', async () => {
    for (const date of ['2026-01-05', '2026-01-07', '2026-01-09']) {
      const job = await addJob(date);
      await uploadPhoto(job);
      await asUser(db, U.cleaner);
      await db.query('select public.complete_wash($1)', [job]);
    }
    for (const date of ['2026-01-12', '2026-01-14']) {
      const job = await addJob(date);
      await asUser(db, U.cleaner);
      await db.query(`select public.mark_vehicle_not_present($1, 'Car away')`, [job]);
    }
    await addJob('2026-01-16'); // still pending
    expect(await progress(U.custA)).toMatchObject({ target: 13, completed: 3, vehicle_not_present: 2, remaining: 10, percent: 23 });
  });

  it('is readable by the owner, the assigned cleaner and admin, and nobody else', async () => {
    expect((await progress(U.cleaner)).completed).toBe(3);
    expect((await progress(U.admin)).completed).toBe(3);
    await expect(progress(U.custB)).rejects.toThrow(/Not allowed/);
    await expect(progress(U.cleaner2)).rejects.toThrow(/Not allowed/);
  });
});

describe('rule 2 — vehicle not present', () => {
  it('is audited, final, and cannot later be turned into a completion', async () => {
    const job = await addJob('2026-01-19');
    await asUser(db, U.cleaner);
    await db.query('select public.mark_vehicle_not_present($1)', [job]);
    await asOwner(db);
    const audit = await rows(db, `select 1 from public.audit_log where action = 'VEHICLE_NOT_PRESENT' and entity_id = $1`, [job]);
    await asUser(db, U.admin);
    expect(audit).toHaveLength(1);
    await expect(db.query(`update public.wash_jobs set status = 'completed' where id = $1`, [job])).rejects.toThrow(/permission denied/);
    // even a direct edit by the database owner is stopped by the trigger
    await asOwner(db);
    await expect(db.query(`update public.wash_jobs set status = 'pending' where id = $1`, [job])).rejects.toThrow(/already been recorded/);
  });
});

describe('rule 3 — no completion without a stored photo', () => {
  it('rejects complete_wash, denies admins direct edits, and the trigger stops even the owner', async () => {
    const job = await addJob('2026-01-21');
    await asUser(db, U.cleaner);
    await expect(db.query('select public.complete_wash($1)', [job])).rejects.toThrow(/without an after-wash photo/);
    await asUser(db, U.admin);
    await expect(db.query(`update public.wash_jobs set status = 'completed' where id = $1`, [job])).rejects.toThrow(/permission denied/);
    await asOwner(db);
    await expect(db.query(`update public.wash_jobs set status = 'completed' where id = $1`, [job])).rejects.toThrow(
      /without an after-wash photo/,
    );
  });

  it('only issues upload keys to the assigned cleaner, once per job', async () => {
    const job = await addJob('2026-01-23');
    await asUser(db, U.cleaner2);
    await expect(db.query('select public.authorize_photo_upload($1)', [job])).rejects.toThrow(/Not allowed/);
    await uploadPhoto(job);
    await asUser(db, U.cleaner);
    await expect(db.query('select public.authorize_photo_upload($1)', [job])).rejects.toThrow(/already been uploaded/);
  });

  it('rejects a registered key that does not belong to the job', async () => {
    const job = await addJob('2026-01-26');
    await asService(db);
    await expect(
      db.query(`select public.register_uploaded_photo($1, $2, 'image/webp', 1000)`, [job, `${ID.vehB}/2026/01/${job}.webp`]),
    ).rejects.toThrow(/does not match/);
  });
});

describe('rules 4–6 — function-only API, with RLS as a second layer', () => {
  it('signed-in users cannot read or write any table directly', async () => {
    for (const user of [U.custA, U.cleaner, U.admin]) {
      await asUser(db, user);
      for (const table of ['profiles', 'customers', 'vehicles', 'wash_jobs', 'wash_photos', 'invoices', 'payments', 'audit_log']) {
        await expect(db.query(`select 1 from public.${table} limit 1`), `${table} as ${user}`).rejects.toThrow(/permission denied/);
      }
    }
    await asUser(db, U.custA);
    await expect(db.query(`update public.profiles set role = 'admin' where id = $1`, [U.custA])).rejects.toThrow(/permission denied/);
    await expect(db.query(`insert into public.wash_jobs (subscription_id, vehicle_id, scheduled_date) values ($1, $2, '2026-01-02')`, [ID.subA, ID.vehA])).rejects.toThrow(/permission denied/);
  });

  it('RLS: customers see only their own rows and never wash_jobs or photos', async () => {
    await asPolicyProbe(db, U.custA);
    expect(await rows(db, 'select id from public.vehicles')).toEqual([{ id: ID.vehA }]);
    expect(await rows(db, 'select id from public.invoices')).toEqual([{ id: ID.invA }]);
    expect(await rows(db, 'select id from public.wash_jobs')).toEqual([]);
    expect(await rows(db, 'select id from public.wash_photos')).toEqual([]);
    expect(await rows(db, 'select id from public.audit_log')).toEqual([]);
    await asPolicyProbe(db, U.custB);
    expect(await rows(db, 'select id from public.invoices')).toEqual([]);
    expect(await rows(db, 'select id from public.vehicles')).toEqual([{ id: ID.vehB }]);
  });

  it('RLS: cleaners see only their own jobs and assigned residents', async () => {
    await asPolicyProbe(db, U.cleaner2);
    expect(await rows(db, 'select id from public.wash_jobs where vehicle_id = $1', [ID.vehA])).toEqual([]);
    expect(await rows(db, 'select id from public.customers')).toEqual([{ id: ID.custB }]);
    expect((await rows<{ id: string }>(db, 'select id from public.profiles')).map((r) => r.id).sort()).toEqual([U.cleaner2, U.custB].sort());
  });

  it('RLS: admin sees everything', async () => {
    await asPolicyProbe(db, U.admin);
    expect((await rows(db, 'select id from public.customers')).length).toBe(2);
    expect((await rows(db, 'select id from public.wash_jobs')).length).toBeGreaterThan(5);
  });
});

describe('rule 7 — resident history carries the date only', () => {
  it('returns wash_date, status and photo_id — no time or cleaner columns', async () => {
    await asUser(db, U.custA);
    const result = await db.query(`select * from public.get_customer_wash_history($1, '2026-01-01', '2026-01-31')`, [ID.vehA]);
    expect(result.fields.map((f) => f.name)).toEqual(['wash_date', 'status', 'photo_id']);
    expect(result.rows.length).toBeGreaterThan(0);
    await asUser(db, U.custB);
    await expect(db.query(`select * from public.get_customer_wash_history($1, '2026-01-01', '2026-01-31')`, [ID.vehA])).rejects.toThrow(/Not allowed/);
  });
});

describe('rule 8 — reschedules never add progress until the makeup wash is completed', () => {
  it('request and approval leave progress unchanged; the photo-verified makeup adds one', async () => {
    // a recent missed wash, so it is inside the 30-day reschedule window
    await asOwner(db);
    const { missed, wanted } = await one<{ missed: string; wanted: string }>(
      db,
      `select to_char(private.today_ist() - 2, 'YYYY-MM-DD') as missed, to_char(private.today_ist() + 3, 'YYYY-MM-DD') as wanted`,
    );
    const job = await addJob(missed);
    await asUser(db, U.cleaner);
    await db.query('select public.mark_vehicle_not_present($1)', [job]);

    const count = async () => {
      await asUser(db, U.custA);
      return (await one<{ completed: number }>(db, `select completed from public.get_subscription_wash_progress($1)`, [ID.subA])).completed;
    };
    const before = await count();
    await asUser(db, U.custA);
    const { id: req } = await one<{ id: string }>(db, `select public.request_reschedule($1, $2, 'Was travelling') as id`, [job, wanted]);
    expect(await count()).toBe(before);
    await asUser(db, U.admin);
    await db.query(`select public.resolve_reschedule($1, true, 'OK')`, [req]);
    expect(await count()).toBe(before);

    // A wash can't be completed before its date, so bring the makeup job to today.
    // Progress is read for the current month, where the makeup now falls.
    await asOwner(db);
    const { makeup } = await one<{ makeup: string }>(db, `select makeup_job_id as makeup from public.reschedule_requests where id = $1`, [req]);
    await db.query(`update public.wash_jobs set scheduled_date = private.today_ist() where id = $1`, [makeup]);
    await uploadPhoto(makeup);
    await asUser(db, U.cleaner);
    await db.query('select public.complete_wash($1)', [makeup]);
    expect(await count()).toBe(before + 1);
  });
});

describe('registration', () => {
  it('always creates a pending customer and cannot be repeated', async () => {
    await asUser(db, U.newbie);
    await db.query(`select public.register_customer('New Resident', '9000002001', 'C', '301', 'TN-10-EF-9012', 'sedan', 'Fictional Car', 'Blue', 'C-07')`);
    expect(await one(db, 'select public.get_my_session() as s')).toMatchObject({ s: { role: 'CUSTOMER', customerStatus: 'PENDING_APPROVAL' } });
    await expect(db.query(`select public.register_customer('X', '9000002002', 'C', '1', 'TN-10-XX-0001', 'sedan', 'X', null, 'C-1')`)).rejects.toThrow(/already registered/);
    await expect(db.query(`select public.select_package($1, $2)`, [ID.vehA, ID.pkg])).rejects.toThrow(/approved resident/);
  });
});

describe('payments — Razorpay crediting is idempotent', () => {
  it('credits an invoice exactly once across verify + repeated webhooks', async () => {
    await asService(db);
    expect((await one<{ o: string }>(db, `select public.attach_razorpay_order($1, 'order_TEST1') as o`, [ID.invA])).o).toBe('order_TEST1');
    // a retry never replaces the order
    expect((await one<{ o: string }>(db, `select public.attach_razorpay_order($1, 'order_OTHER') as o`, [ID.invA])).o).toBe('order_TEST1');

    await expect(db.query(`select public.apply_razorpay_payment('order_TEST1', 'pay_TEST1', 99, 'upi')`)).rejects.toThrow(/does not match/);
    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      results.push((await one<{ r: string }>(db, `select public.apply_razorpay_payment('order_TEST1', 'pay_TEST1', 100, 'upi') as r`)).r);
    }
    expect(results).toEqual(['applied', 'duplicate', 'duplicate']);
    expect(await rows(db, `select status from public.payments where invoice_id = $1`, [ID.invA])).toEqual([{ status: 'success' }]);
    expect(await one(db, `select status, amount_paid_paise from public.invoices where id = $1`, [ID.invA])).toEqual({ status: 'paid', amount_paid_paise: 100 });
    // a late failure event for the same payment never downgrades it
    expect((await one<{ r: string }>(db, `select public.record_failed_razorpay_payment('order_TEST1', 'pay_TEST1', 100, 'late') as r`)).r).toBe('duplicate');
    expect(await rows(db, `select status from public.payments where invoice_id = $1`, [ID.invA])).toEqual([{ status: 'success' }]);
  });
});

describe('003 — 60-day photo retention', () => {
  it('claims and deletes only photos past retention, and logs the purge', async () => {
    const oldJob = await addJob('2026-01-28');
    const oldPhoto = await uploadPhoto(oldJob);
    await asOwner(db);
    await db.query(`update public.wash_photos set uploaded_at = now() - interval '61 days', retain_until = now() - interval '1 day' where id = $1`, [oldPhoto]);

    await asService(db);
    const claimed = await rows<{ photo_id: string }>(db, 'select photo_id from public.claim_expired_photos()');
    expect(claimed.map((c) => c.photo_id)).toEqual([oldPhoto]);

    const recent = await rows<{ id: string }>(db, `select id from public.wash_photos where id <> $1 and deleted_at is null`, [oldPhoto]);
    const ids = [oldPhoto, ...recent.map((r) => r.id)];
    expect((await one<{ n: number }>(db, 'select public.confirm_photos_deleted($1::uuid[]) as n', [ids])).n).toBe(1);
    expect(await rows(db, 'select id from public.wash_photos where deleted_at is not null')).toEqual([{ id: oldPhoto }]);

    await asOwner(db);
    expect(await rows(db, `select detail from public.audit_log where action = 'PHOTOS_PURGED'`)).toHaveLength(1);
  });

  it('refuses to shorten retention below 60 days', async () => {
    await asOwner(db);
    await expect(db.query(`update public.wash_photos set retain_until = uploaded_at + interval '30 days'`)).rejects.toThrow(/check constraint/);
  });

  it('keeps the audit log append-only', async () => {
    await asOwner(db);
    await expect(db.query(`delete from public.audit_log`)).rejects.toThrow(/append-only/);
    await expect(db.query(`update public.audit_log set detail = 'x'`)).rejects.toThrow(/append-only/);
  });
});

describe('scheduled job generation', () => {
  it('follows the package weekdays and is idempotent', async () => {
    await asService(db);
    // 2026-02-02 is a Monday (mon_wed_fri), 2026-02-03 a Tuesday
    expect((await one<{ n: number }>(db, `select public.generate_wash_jobs('2026-02-02') as n`)).n).toBe(2);
    expect((await one<{ n: number }>(db, `select public.generate_wash_jobs('2026-02-02') as n`)).n).toBe(0);
    expect((await one<{ n: number }>(db, `select public.generate_wash_jobs('2026-02-03') as n`)).n).toBe(0);
  });
});
