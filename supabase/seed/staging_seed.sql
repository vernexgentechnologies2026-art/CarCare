-- =============================================================================
-- CarCare — STAGING seed for client UAT. FICTIONAL DATA ONLY. Never run on production.
--
-- Before running:
--  1. Migrations 001–005 are applied to the STAGING project.
--  2. In Supabase → Authentication → Users → "Add user", create these users with
--     "Auto Confirm User" ticked (passwords are shared with the reviewer privately):
--       9000000001@users.carcare.local   admin
--       9000000101@users.carcare.local   cleaner (Block A)
--       9000000102@users.carcare.local   cleaner (Block B)
--       9000001001@users.carcare.local   resident, approved, daily plan
--       9000001002@users.carcare.local   resident, approved, Mon·Wed·Fri plan
--     (If VITE_AUTH_EMAIL_DOMAIN is not users.carcare.local, change v_domain below.)
--  3. Run this file in the SQL editor. It is safe to run again.
--
-- Package prices are placeholders (₹1–₹8, Razorpay test-mode minimums), not
-- commercial prices; the client enters real prices in Admin → Packages.
-- =============================================================================
do $seed$
declare
  v_domain constant text := 'users.carcare.local';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_admin uuid; v_c1 uuid; v_c2 uuid; v_r1 uuid; v_r2 uuid;
  v_cl1 uuid; v_cl2 uuid; v_cu1 uuid; v_cu2 uuid; v_v1 uuid; v_v2 uuid;
  v_daily uuid; v_mwf uuid; v_s1 uuid; v_s2 uuid;
begin
  -- Safety: a database with real residents is not a staging database.
  if (select count(*) from public.customers) > 20 then
    raise exception 'Refusing to seed: this database already has % customers. Staging seed is for an empty staging project.',
      (select count(*) from public.customers);
  end if;

  select id into v_admin from auth.users where email = '9000000001@' || v_domain;
  select id into v_c1    from auth.users where email = '9000000101@' || v_domain;
  select id into v_c2    from auth.users where email = '9000000102@' || v_domain;
  select id into v_r1    from auth.users where email = '9000001001@' || v_domain;
  select id into v_r2    from auth.users where email = '9000001002@' || v_domain;
  if v_admin is null or v_c1 is null or v_c2 is null or v_r1 is null or v_r2 is null then
    raise exception 'Create the five staging users in Authentication first (see the header of this file).';
  end if;

  -- People (fictional)
  insert into public.profiles (id, role, full_name, phone) values
    (v_admin, 'admin', 'Staging Admin', '9000000001'),
    (v_c1, 'cleaner', 'Staging Cleaner A', '9000000101'),
    (v_c2, 'cleaner', 'Staging Cleaner B', '9000000102'),
    (v_r1, 'customer', 'Test Resident One', '9000001001'),
    (v_r2, 'customer', 'Test Resident Two', '9000001002')
  on conflict (id) do nothing;

  insert into public.cleaners (profile_id, assigned_blocks) values (v_c1, '{A}'), (v_c2, '{B}') on conflict (profile_id) do nothing;
  select id into v_cl1 from public.cleaners where profile_id = v_c1;
  select id into v_cl2 from public.cleaners where profile_id = v_c2;

  insert into public.customers (profile_id, block, flat, status, approved_at) values
    (v_r1, 'A', '101', 'active', now()), (v_r2, 'B', '204', 'active', now())
  on conflict (profile_id) do nothing;
  select id into v_cu1 from public.customers where profile_id = v_r1;
  select id into v_cu2 from public.customers where profile_id = v_r2;

  insert into public.vehicles (customer_id, cleaner_id, registration, car_size, make_model, color, parking_slot, instructions) values
    (v_cu1, v_cl1, 'TN-01-UA-0001', 'sedan', 'Test Sedan', 'White', 'A-12', 'Fictional test vehicle'),
    (v_cu2, v_cl2, 'TN-01-UA-0002', 'hatchback', 'Test Hatchback', 'Red', 'B-04', null)
  on conflict (registration) do nothing;
  select id into v_v1 from public.vehicles where registration = 'TN-01-UA-0001';
  select id into v_v2 from public.vehicles where registration = 'TN-01-UA-0002';

  -- Packages: the four contracted schedules × two size tiers, placeholder prices
  insert into public.packages (name, schedule_pattern, car_sizes, monthly_price_paise, description, features) values
    ('Daily — Hatch & Sedan',        'daily',       '{hatchback,sedan}',       100, 'Placeholder price for UAT', '{"Exterior wash","Photo after every wash"}'),
    ('Daily — SUV',                  'daily',       '{compact_suv,large_suv}', 200, 'Placeholder price for UAT', '{"Exterior wash","Photo after every wash"}'),
    ('Mon · Wed · Fri — Hatch & Sedan','mon_wed_fri','{hatchback,sedan}',       300, 'Placeholder price for UAT', '{"Exterior wash"}'),
    ('Mon · Wed · Fri — SUV',        'mon_wed_fri', '{compact_suv,large_suv}', 400, 'Placeholder price for UAT', '{"Exterior wash"}'),
    ('Tue · Fri — Hatch & Sedan',    'tue_fri',     '{hatchback,sedan}',       500, 'Placeholder price for UAT', '{"Exterior wash"}'),
    ('Tue · Fri — SUV',              'tue_fri',     '{compact_suv,large_suv}', 600, 'Placeholder price for UAT', '{"Exterior wash"}'),
    ('Thursday only — Hatch & Sedan','thu_only',    '{hatchback,sedan}',       700, 'Placeholder price for UAT', '{"Exterior wash"}'),
    ('Thursday only — SUV',          'thu_only',    '{compact_suv,large_suv}', 800, 'Placeholder price for UAT', '{"Exterior wash"}')
  on conflict (name) do nothing;
  select id into v_daily from public.packages where name = 'Daily — Hatch & Sedan';
  select id into v_mwf   from public.packages where name = 'Mon · Wed · Fri — Hatch & Sedan';

  -- Subscriptions (started 10 days ago so there is history)
  if not exists (select 1 from public.subscriptions where vehicle_id = v_v1 and status = 'active') then
    insert into public.subscriptions (vehicle_id, package_id, starts_on) values (v_v1, v_daily, v_today - 10);
  end if;
  if not exists (select 1 from public.subscriptions where vehicle_id = v_v2 and status = 'active') then
    insert into public.subscriptions (vehicle_id, package_id, starts_on) values (v_v2, v_mwf, v_today - 10);
  end if;
  select id into v_s1 from public.subscriptions where vehicle_id = v_v1 and status = 'active';
  select id into v_s2 from public.subscriptions where vehicle_id = v_v2 and status = 'active';

  -- A missed wash two days ago (Vehicle Not Present), so UAT can test rescheduling.
  insert into public.wash_jobs (subscription_id, vehicle_id, cleaner_id, scheduled_date, status, recorded_at, note)
  values (v_s1, v_v1, v_cl1, v_today - 2, 'vehicle_not_present', now(), 'Seeded for UAT')
  on conflict (subscription_id, scheduled_date, is_makeup) do nothing;

  -- Today's jobs and this month's invoices
  perform public.generate_wash_jobs(v_today);
  perform public.generate_monthly_invoices(v_today);

  raise notice 'Staging seed complete: 5 users, 8 packages, 2 vehicles, 1 missed wash, today''s jobs and invoices.';
end
$seed$;
