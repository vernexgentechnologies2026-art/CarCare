// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asOwner, asUser, createDatabase, one, rows } from './pglite';

/*
 * §28 capacity budget on a realistic slice: 500 vehicles × 30 days = 15,000
 * washes, each with its photo row. (PGlite is PostgreSQL 16 with 8 KB pages and
 * 8-byte alignment for 8-byte types, so sizes match a 64-bit server closely.)
 */

const ADMIN = '00000000-0000-4000-8000-00000000a000';
let db: PGlite;
let washes = 0;

beforeAll(async () => {
  db = await createDatabase();
  await asOwner(db);
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN}');
    insert into public.profiles (id, role, full_name, phone) values ('${ADMIN}', 'admin', 'Admin', '9000000001');
    insert into auth.users select gen_random_uuid() from generate_series(1, 10);
    insert into public.profiles (id, role, full_name, phone)
      select id, 'cleaner', 'Cleaner', '70000000' || lpad((row_number() over ())::text, 2, '0') from auth.users where id <> '${ADMIN}';
    insert into public.cleaners (profile_id) select id from public.profiles where role = 'cleaner';
    insert into auth.users select gen_random_uuid() from generate_series(1, 500);
    insert into public.profiles (id, role, full_name, phone)
      select id, 'customer', 'Resident Name', '8' || lpad((row_number() over ())::text, 9, '0') from auth.users where id not in (select id from public.profiles);
    insert into public.customers (profile_id, block, flat, status)
      select id, chr(65 + (row_number() over ())::int % 6), '101', 'active' from public.profiles where role = 'customer';
    insert into public.vehicles (customer_id, cleaner_id, registration, car_size, make_model, parking_slot)
      select c.id, (array(select id from public.cleaners order by id))[1 + (row_number() over ())::int % 10],
             'TN-09-AB-' || lpad((row_number() over ())::text, 4, '0'), 'sedan', 'Fictional Sedan', 'A-12'
        from public.customers c;
    insert into public.packages (name, schedule_pattern, car_sizes, monthly_price_paise) values ('Plan', 'daily', '{sedan}', 100);
    insert into public.subscriptions (vehicle_id, package_id, starts_on) select v.id, (select id from public.packages), '2026-01-01' from public.vehicles v;
    insert into public.wash_jobs (subscription_id, vehicle_id, cleaner_id, scheduled_date)
      select s.id, s.vehicle_id, v.cleaner_id, d::date
        from public.subscriptions s join public.vehicles v on v.id = s.vehicle_id, generate_series('2026-01-01'::date, '2026-01-30'::date, '1 day') d;
    insert into public.wash_photos (wash_job_id, is_jpeg, size_bytes, uploaded_by) select j.id, false, 120000, j.cleaner_id from public.wash_jobs j;
    update public.wash_jobs set status = 'completed', recorded_at = now();
  `);
  // Compact away the dead row versions from the bulk update (what autovacuum
  // reclaims for reuse in steady state), then refresh planner statistics.
  for (const stmt of ['vacuum full public.wash_jobs', 'vacuum full public.wash_photos', 'analyze']) await db.exec(stmt);
  washes = (await one<{ n: number }>(db, 'select count(*)::int as n from public.wash_jobs')).n;
}, 180_000);

describe('database size budget (§28.3)', () => {
  it('a wash (job row + photo row + all their indexes) averages under 0.5 KB', async () => {
    const { bytes } = await one<{ bytes: number }>(
      db,
      `select (pg_total_relation_size('public.wash_jobs') + pg_total_relation_size('public.wash_photos'))::int as bytes`,
    );
    const perWash = bytes / washes;
    console.info(`capacity: ${washes} washes, ${(bytes / 1024 / 1024).toFixed(1)} MB, ${perWash.toFixed(0)} B per wash`);
    expect(washes).toBe(15_000);
    expect(perWash).toBeLessThan(512);
  });
});

describe('index use on the hot paths (EXPLAIN)', () => {
  const plan = async (sql: string) => JSON.stringify((await rows(db, `explain (format json) ${sql}`))[0]);
  let vehicle = '';
  let cleaner = '';

  beforeAll(async () => {
    await asOwner(db);
    ({ vehicle, cleaner } = await one<{ vehicle: string; cleaner: string }>(db, 'select id as vehicle, cleaner_id as cleaner from public.vehicles limit 1'));
  });

  it('monthly progress for a vehicle uses wash_jobs_vehicle_date_idx', async () => {
    const p = await plan(`select count(*) filter (where status = 'completed') from public.wash_jobs
                           where vehicle_id = '${vehicle}' and scheduled_date >= '2026-01-01' and scheduled_date < '2026-02-01'`);
    expect(p).toContain('wash_jobs_vehicle_date_idx');
    expect(p).not.toContain('"Seq Scan"');
  });

  it("a cleaner's day uses wash_jobs_cleaner_date_idx", async () => {
    const p = await plan(`select id from public.wash_jobs where cleaner_id = '${cleaner}' and scheduled_date = '2026-01-15'`);
    expect(p).toContain('wash_jobs_cleaner_date_idx');
  });

  it('a resident history page uses the vehicle index, not a scan', async () => {
    const p = await plan(`select scheduled_date, status from public.wash_jobs where vehicle_id = '${vehicle}' order by scheduled_date desc limit 20`);
    expect(p).toContain('wash_jobs_vehicle_date_idx');
  });

  it('admin daily counts use wash_jobs_date_status_idx', async () => {
    const p = await plan(`select count(*) from public.wash_jobs where scheduled_date = '2026-01-15'`);
    expect(p).toContain('wash_jobs_date_status_idx');
  });

  it('the retention sweep uses the partial retention index', async () => {
    const p = await plan(`select id from public.wash_photos where deleted_at is null and retain_until < now() + interval '90 days' order by retain_until limit 500`);
    expect(p).toContain('wash_photos_retention_idx');
  });
});

describe('pagination everywhere', () => {
  it('every function that returns a list page clamps its size with private.lim', async () => {
    await asOwner(db);
    const lists = await rows<{ proname: string; def: string }>(
      db,
      `select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and pg_get_functiondef(p.oid) like '%''items''%'`,
    );
    expect(lists.length).toBeGreaterThanOrEqual(14);
    for (const fn of lists) expect(fn.def, fn.proname).toContain('private.lim(p_limit)');
  });

  it('asking for 100,000 rows still returns at most 100', async () => {
    await asUser(db, ADMIN);
    const { r } = await one<{ r: { items: unknown[]; total: number } }>(db, `select public.admin_list_customers(null, null, null, null, 100000, 0) as r`);
    expect(r.total).toBe(500);
    expect(r.items).toHaveLength(100);
  });

  it('fixed-size summaries are bounded (trend ≤ 31 days, week ≤ 14 days, wash summary ≤ 62 days)', async () => {
    await asUser(db, ADMIN);
    expect((await one<{ r: unknown[] }>(db, `select public.get_daily_trend('2026-01-30', 1000) as r`)).r).toHaveLength(31);
    await expect(db.query(`select public.get_wash_summary('2026-01-01', '2026-06-01', null, null)`)).rejects.toThrow(/62 days/);
    const { cleaner } = await one<{ cleaner: string }>(db, `select (select id from public.cleaners limit 1)::text as cleaner`).catch(() => ({ cleaner: '' }));
    if (cleaner) expect((await one<{ r: unknown[] }>(db, `select public.get_cleaner_week_schedule($1, '2026-01-01', 365) as r`, [cleaner])).r).toHaveLength(14);
  });
});
