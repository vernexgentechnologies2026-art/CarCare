// @vitest-environment node
import { describe, expect, it } from 'vitest';
import seed from '../../supabase/seed/staging_seed.sql?raw';
import { asOwner, createDatabase, one } from './pglite';

const EMAILS = ['9000000001', '9000000101', '9000000102', '9000001001', '9000001002'].map((p) => `${p}@users.carcare.local`);

describe('supabase/seed/staging_seed.sql', () => {
  it('refuses to run before the staging users exist', async () => {
    const db = await createDatabase();
    await asOwner(db);
    await expect(db.exec(seed)).rejects.toThrow(/Create the five staging users/);
  }, 60_000);

  it('seeds fictional UAT data, is safe to re-run, and passes verify-level checks', async () => {
    const db = await createDatabase();
    await asOwner(db);
    for (const email of EMAILS) await db.query('insert into auth.users (id, email) values (gen_random_uuid(), $1)', [email]);
    await db.exec(seed);
    await db.exec(seed); // idempotent
    const counts = await one<Record<string, number>>(
      db,
      `select (select count(*)::int from public.profiles) as profiles, (select count(*)::int from public.packages) as packages,
              (select count(*)::int from public.subscriptions where status = 'active') as subs,
              (select count(*)::int from public.wash_jobs where status = 'vehicle_not_present') as missed,
              (select count(*)::int from public.wash_jobs where scheduled_date = (now() at time zone 'Asia/Kolkata')::date) as today,
              (select count(*)::int from public.invoices) as invoices,
              (select max(monthly_price_paise)::int from public.packages) as max_price_paise`,
    );
    expect(counts).toMatchObject({ profiles: 5, packages: 8, subs: 2, missed: 1, invoices: 2 });
    expect(counts.today).toBeGreaterThanOrEqual(1);
    expect(counts.max_price_paise).toBeLessThanOrEqual(800); // placeholder prices only
  }, 60_000);

  it('refuses to run on a database that already has real customers', async () => {
    const db = await createDatabase();
    await asOwner(db);
    await db.exec(`
      insert into auth.users (id) select gen_random_uuid() from generate_series(1, 21);
      insert into public.profiles (id, role, full_name, phone) select id, 'customer', 'Someone', '8' || lpad((row_number() over ())::text, 9, '0') from auth.users;
      insert into public.customers (profile_id, block, flat) select id, 'A', '1' from public.profiles;`);
    await expect(db.exec(seed)).rejects.toThrow(/Refusing to seed/);
  }, 60_000);
});
