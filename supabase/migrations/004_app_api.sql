-- =============================================================================
-- CarCare — 004_app_api.sql
-- The read/write API the frontend services call (Phase 5). Every function:
--   * is SECURITY DEFINER with an explicit role/ownership check,
--   * returns JSON already shaped like the frontend DTOs (camelCase keys,
--     UPPER_SNAKE enums, whole rupees), so the browser never sees raw tables,
--   * is paginated (limit clamped to 100) or returns a fixed-size summary.
-- Also: explicit audit actions matching the admin audit screen, invoice
-- generation / overdue marking, and re-request after a rejected reschedule.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Adjustments to 001/002
-- ----------------------------------------------------------------------------
-- Audit entries now come from the RPCs with the app's action names.
drop trigger if exists packages_audit on public.packages;
drop trigger if exists customers_audit on public.customers;
drop trigger if exists cleaners_audit on public.cleaners;
drop trigger if exists vehicles_audit on public.vehicles;
drop trigger if exists subscriptions_audit on public.subscriptions;
drop function if exists private.audit_admin_edit();

-- Admin edits go through the audited RPCs below, not direct table writes.
drop policy if exists packages_insert_admin on public.packages;
drop policy if exists packages_update_admin on public.packages;
drop policy if exists customers_update_admin on public.customers;
drop policy if exists cleaners_insert_admin on public.cleaners;
drop policy if exists cleaners_update_admin on public.cleaners;
drop policy if exists vehicles_update_admin on public.vehicles;
drop policy if exists subscriptions_update_admin on public.subscriptions;
drop policy if exists wash_jobs_update_admin on public.wash_jobs;
revoke insert, update, delete on all tables in schema public from authenticated;

-- A rejected reschedule may be requested again; one open/approved request per missed wash.
alter table public.reschedule_requests drop constraint if exists reschedule_requests_missed_job_id_key;
create unique index reschedule_one_live_per_job on public.reschedule_requests (missed_job_id) where status <> 'rejected';

-- ----------------------------------------------------------------------------
-- Small helpers
-- ----------------------------------------------------------------------------
create function private.lim(p integer) returns integer language sql immutable as $$ select least(greatest(coalesce(p, 20), 1), 100) $$;
create function private.off(p integer) returns integer language sql immutable as $$ select greatest(coalesce(p, 0), 0) $$;
create function private.cycle_start(p_cycle text) returns date language sql immutable as $$ select to_date(p_cycle || '-01', 'YYYY-MM-DD') $$;

create function private.require_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception using errcode = '42501', message = 'Not allowed.'; end if;
end $$;

-- Admin, or the cleaner themself.
create function private.require_admin_or_cleaner(p_cleaner uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_admin() or p_cleaner = private.current_cleaner_id()) then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
end $$;

-- Admin, the owning resident, or (optionally) the assigned cleaner.
create function private.require_vehicle_access(p_vehicle uuid, p_allow_cleaner boolean default true) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.vehicles v where v.id = p_vehicle
       and (private.is_admin() or v.customer_id = private.current_customer_id()
            or (p_allow_cleaner and v.cleaner_id is not null and v.cleaner_id = private.current_cleaner_id()))
  ) then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
end $$;

create function private.effective_invoice_status(i public.invoices) returns text language sql stable set search_path = '' as $$
  select case when i.status = 'due' and i.due_on < private.today_ist() then 'OVERDUE' else upper(i.status::text) end
$$;

-- ----------------------------------------------------------------------------
-- JSON shapes (mirror src/types)
-- ----------------------------------------------------------------------------
create function private.customer_json(p_id uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'name', p.full_name, 'phone', p.phone, 'block', c.block, 'flat', c.flat,
    'address', 'Block ' || c.block || ', Flat ' || c.flat, 'status', upper(c.status::text),
    'createdAt', c.created_at, 'rejectionReason', c.rejection_reason)
  from public.customers c join public.profiles p on p.id = c.profile_id where c.id = p_id
$$;

create function private.package_json(k public.packages) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', k.id, 'name', k.name,
    'carSizes', (select coalesce(jsonb_agg(upper(s::text) order by s), '[]'::jsonb) from unnest(k.car_sizes) s),
    'schedulePattern', upper(k.schedule_pattern::text),
    'monthlyPrice', k.monthly_price_paise / 100, 'description', k.description,
    'features', to_jsonb(k.features), 'active', k.active)
$$;

create function private.cleaner_json(p_id uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', cl.id, 'name', p.full_name, 'phone', p.phone, 'active', cl.active, 'assignedBlocks', to_jsonb(cl.assigned_blocks))
  from public.cleaners cl join public.profiles p on p.id = cl.profile_id where cl.id = p_id
$$;

create function private.active_package(p_vehicle uuid) returns public.packages language sql stable security definer set search_path = '' as $$
  select k.* from public.subscriptions s join public.packages k on k.id = s.package_id
   where s.vehicle_id = p_vehicle and s.status = 'active' limit 1
$$;

-- Rule 7: residents never receive the cleaner (id or name).
create function private.vehicle_json(p_id uuid, p_for_customer boolean) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', v.id, 'customerId', v.customer_id, 'registration', v.registration, 'carSize', upper(v.car_size::text),
    'makeModel', v.make_model, 'color', coalesce(v.color, ''), 'packageId', k.id,
    'cleanerId', case when p_for_customer then null else v.cleaner_id end,
    'parkingSlot', v.parking_slot, 'timeRestriction', v.time_restriction, 'instructions', v.instructions,
    'package', case when k.id is null then null else private.package_json(k) end,
    'cleaner', case when p_for_customer or v.cleaner_id is null then null
                    else (select jsonb_build_object('id', cl.id, 'name', p.full_name)
                            from public.cleaners cl join public.profiles p on p.id = cl.profile_id where cl.id = v.cleaner_id) end)
  from public.vehicles v left join lateral private.active_package(v.id) k on true
  where v.id = p_id
$$;

create function private.job_json(p_job uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'date', j.scheduled_date, 'status', upper(j.status::text), 'isReschedule', j.is_makeup,
    'vehicle', jsonb_build_object('id', v.id, 'registration', v.registration, 'carSize', upper(v.car_size::text),
                                  'makeModel', v.make_model, 'color', coalesce(v.color, ''), 'parkingSlot', v.parking_slot,
                                  'timeRestriction', v.time_restriction, 'instructions', v.instructions),
    'vehiclePhotoId', 'car:' || v.id,
    'owner', jsonb_build_object('id', c.id, 'name', p.full_name, 'phone', p.phone, 'block', c.block, 'flat', c.flat,
                                'address', 'Block ' || c.block || ', Flat ' || c.flat),
    'packageName', k.name, 'schedulePattern', upper(k.schedule_pattern::text),
    'record', case when j.status in ('completed', 'vehicle_not_present') then jsonb_build_object(
        'id', j.id, 'jobId', j.id, 'vehicleId', j.vehicle_id, 'cleanerId', j.cleaner_id, 'scheduledDate', j.scheduled_date,
        'status', upper(j.status::text), 'recordedAt', j.recorded_at,
        'photoId', (select ph.id from public.wash_photos ph where ph.wash_job_id = j.id and ph.deleted_at is null),
        'note', j.note) end)
  from public.wash_jobs j
  join public.vehicles v on v.id = j.vehicle_id
  join public.customers c on c.id = v.customer_id
  join public.profiles p on p.id = c.profile_id
  join public.subscriptions s on s.id = j.subscription_id
  join public.packages k on k.id = s.package_id
  where j.id = p_job
$$;

create function private.invoice_json(i public.invoices) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', i.id, 'number', i.number, 'customerId', i.customer_id,
    'vehicleId', (select s.vehicle_id from public.subscriptions s where s.id = i.subscription_id),
    'cycle', to_char(i.cycle_month, 'YYYY-MM'), 'issuedOn', i.issued_on, 'dueOn', i.due_on,
    'amount', i.amount_paise / 100.0, 'amountPaid', i.amount_paid_paise / 100.0,
    'status', private.effective_invoice_status(i), 'overrideNote', i.override_note)
$$;

create function private.payment_json(x public.payments) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', x.id, 'invoiceId', x.invoice_id, 'customerId', x.customer_id, 'amount', x.amount_paise / 100.0,
    'method', coalesce(upper(x.method::text), 'UPI'), 'status', upper(x.status::text),
    'reference', coalesce(x.razorpay_payment_id, 'CASH-' || left(x.id::text, 8)),
    'createdAt', x.created_at, 'failureReason', x.failure_reason, 'simulated', false)
$$;

create function private.reschedule_json(r public.reschedule_requests) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'customerId', r.customer_id, 'vehicleId', j.vehicle_id, 'missedDate', j.scheduled_date,
    'requestedDate', r.requested_date, 'reason', r.reason, 'status', upper(r.status::text),
    'createdAt', r.created_at, 'resolvedAt', r.resolved_at, 'adminNote', r.admin_note)
  from public.wash_jobs j where j.id = r.missed_job_id
$$;

-- ----------------------------------------------------------------------------
-- Job grid: real jobs plus not-yet-generated scheduled days (today onward),
-- so calendars and forecasts are complete before the nightly generator runs.
-- ----------------------------------------------------------------------------
create function private.job_grid(p_from date, p_to date)
returns table (job_id uuid, vehicle_id uuid, cleaner_id uuid, block text, scheduled_date date, status public.wash_status, is_makeup boolean)
language sql stable security definer set search_path = '' as $$
  select j.id, j.vehicle_id, j.cleaner_id, c.block, j.scheduled_date, j.status, j.is_makeup
    from public.wash_jobs j join public.vehicles v on v.id = j.vehicle_id join public.customers c on c.id = v.customer_id
   where j.scheduled_date between p_from and p_to
  union all
  select null, s.vehicle_id, v.cleaner_id, c.block, d::date, 'pending'::public.wash_status, false
    from public.subscriptions s
    join public.packages k on k.id = s.package_id
    join public.vehicles v on v.id = s.vehicle_id
    join public.customers c on c.id = v.customer_id
    cross join generate_series(greatest(p_from, private.today_ist()), p_to, interval '1 day') d
   where s.status = 'active' and c.status = 'active' and s.starts_on <= d::date and (s.ends_on is null or s.ends_on >= d::date)
     and private.pattern_includes(k.schedule_pattern, d::date)
     and not exists (select 1 from public.wash_jobs j2 where j2.subscription_id = s.id and j2.scheduled_date = d::date and not j2.is_makeup)
$$;

-- ============================================================================
-- Session
-- ============================================================================
create function public.get_my_session() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'userId', p.id, 'role', upper(p.role::text), 'displayName', p.full_name, 'phone', p.phone,
    'customerId', c.id, 'cleanerId', cl.id, 'customerStatus', upper(c.status::text))
  from public.profiles p
  left join public.customers c on c.profile_id = p.id
  left join public.cleaners cl on cl.profile_id = p.id
  where p.id = auth.uid()
$$;

-- ============================================================================
-- Customers
-- ============================================================================
create function public.admin_list_customers(p_search text, p_status text, p_block text, p_cleaner text, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_term text := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_result jsonb;
begin
  perform private.require_admin();
  with base as (
    select c.id, c.created_at,
           (select v.id from public.vehicles v where v.customer_id = c.id order by v.created_at limit 1) as vehicle_id
      from public.customers c join public.profiles p on p.id = c.profile_id
     where (coalesce(p_status, 'ALL') = 'ALL' or c.status::text = lower(p_status))
       and (coalesce(p_block, 'ALL') = 'ALL' or c.block = p_block)
       and (v_term is null or lower(p.full_name) like '%' || v_term || '%' or p.phone like '%' || v_term || '%'
            or exists (select 1 from public.vehicles v where v.customer_id = c.id and lower(v.registration) like '%' || v_term || '%')
            or lower(c.flat) = v_term)
       and (coalesce(p_cleaner, 'ALL') = 'ALL'
            or (p_cleaner = 'UNASSIGNED' and exists (select 1 from public.vehicles v where v.customer_id = c.id and v.cleaner_id is null))
            or exists (select 1 from public.vehicles v where v.customer_id = c.id and v.cleaner_id::text = p_cleaner))
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce((select jsonb_agg(jsonb_build_object('customer', private.customer_json(b.id),
                                                          'vehicle', case when b.vehicle_id is null then null else private.vehicle_json(b.vehicle_id, false) end)
                                        order by b.created_at desc)
                         from (select * from base order by created_at desc limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb))
    into v_result;
  return v_result;
end $$;

create function public.get_customer_detail(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean := private.is_admin();
begin
  if not (v_admin or p_customer_id = private.current_customer_id()) then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception using errcode = 'P0001', message = 'Customer not found.';
  end if;
  return jsonb_build_object(
    'customer', private.customer_json(p_customer_id),
    'vehicles', coalesce((select jsonb_agg(private.vehicle_json(v.id, not v_admin) order by v.created_at)
                            from public.vehicles v where v.customer_id = p_customer_id), '[]'::jsonb));
end $$;

drop function public.approve_customer(uuid);
create function public.approve_customer(p_customer_id uuid, p_cleaner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.cleaners where id = p_cleaner_id and active) then
    perform private.raise_rule('Choose an active cleaner.');
  end if;
  update public.customers set status = 'active', approved_at = now(), rejection_reason = null
   where id = p_customer_id and status = 'pending_approval';
  if not found then perform private.raise_rule('This registration is not awaiting approval.'); end if;
  update public.vehicles set cleaner_id = p_cleaner_id where customer_id = p_customer_id;
  perform private.write_audit('REGISTRATION_APPROVED', 'CUSTOMER', p_customer_id::text);
end $$;

create function public.set_customer_status(p_customer_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_status not in ('ACTIVE', 'PAUSED') then perform private.raise_rule('Status must be active or paused.'); end if;
  update public.customers set status = lower(p_status)::public.customer_status
   where id = p_customer_id and status in ('active', 'paused');
  if not found then perform private.raise_rule('Only approved residents can be paused or resumed.'); end if;
  perform private.write_audit(case when p_status = 'PAUSED' then 'CUSTOMER_PAUSED' else 'CUSTOMER_RESUMED' end, 'CUSTOMER', p_customer_id::text);
end $$;

create function public.assign_cleaner(p_vehicle_id uuid, p_cleaner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.cleaners where id = p_cleaner_id and active) then perform private.raise_rule('Choose an active cleaner.'); end if;
  update public.vehicles set cleaner_id = p_cleaner_id where id = p_vehicle_id;
  if not found then perform private.raise_rule('Vehicle not found.'); end if;
  update public.wash_jobs set cleaner_id = p_cleaner_id
   where vehicle_id = p_vehicle_id and status in ('pending', 'in_progress') and scheduled_date >= private.today_ist();
  perform private.write_audit('CLEANER_ASSIGNED', 'VEHICLE', p_vehicle_id::text, p_cleaner_id::text);
end $$;

create function public.admin_change_package(p_vehicle_id uuid, p_package_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_size public.car_size;
begin
  perform private.require_admin();
  select car_size into v_size from public.vehicles where id = p_vehicle_id;
  if v_size is null then perform private.raise_rule('Vehicle not found.'); end if;
  if not exists (select 1 from public.packages where id = p_package_id and active and v_size = any (car_sizes)) then
    perform private.raise_rule('This package is not available for the car size.');
  end if;
  update public.subscriptions set status = 'ended', ends_on = greatest(starts_on, private.today_ist() - 1)
   where vehicle_id = p_vehicle_id and status = 'active';
  insert into public.subscriptions (vehicle_id, package_id, starts_on) values (p_vehicle_id, p_package_id, private.today_ist());
  perform private.write_audit('PACKAGE_CHANGED', 'VEHICLE', p_vehicle_id::text, p_package_id::text);
end $$;

create function public.count_customers_by_status() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (select jsonb_build_object(
    'PENDING_APPROVAL', count(*) filter (where status = 'pending_approval'),
    'ACTIVE', count(*) filter (where status = 'active'),
    'REJECTED', count(*) filter (where status = 'rejected'),
    'PAUSED', count(*) filter (where status = 'paused')) from public.customers);
end $$;

-- ============================================================================
-- Packages
-- ============================================================================
create function public.list_packages(p_include_inactive boolean, p_car_size text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_all boolean := coalesce(p_include_inactive, false) and private.is_admin();
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Not allowed.'; end if;
  return (
    with base as (
      select k.* from public.packages k
       where (v_all or k.active) and (p_car_size is null or lower(p_car_size)::public.car_size = any (k.car_sizes))
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(private.package_json(b) order by b.monthly_price_paise, b.name)
                           from (select * from base order by monthly_price_paise, name limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

create function public.save_package(p_id uuid, p_name text, p_car_sizes text[], p_schedule_pattern text, p_monthly_price integer,
                                    p_description text, p_features text[], p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.packages;
  v_sizes public.car_size[] := (select array_agg(lower(s)::public.car_size) from unnest(p_car_sizes) s);
begin
  perform private.require_admin();
  if p_monthly_price is null or p_monthly_price < 1 then perform private.raise_rule('Price must be greater than zero.'); end if;
  if p_id is null then
    insert into public.packages (name, schedule_pattern, car_sizes, monthly_price_paise, description, features, active)
    values (trim(p_name), lower(p_schedule_pattern)::public.schedule_pattern, v_sizes, p_monthly_price * 100,
            coalesce(p_description, ''), coalesce(p_features, '{}'), coalesce(p_active, true))
    returning * into v_row;
    perform private.write_audit('PACKAGE_CREATED', 'PACKAGE', v_row.id::text, v_row.name);
  else
    if exists (select 1 from public.subscriptions s join public.vehicles v on v.id = s.vehicle_id
                where s.package_id = p_id and s.status = 'active' and not (v.car_size = any (v_sizes))) then
      perform private.raise_rule('Vehicles subscribed to this package still use a car size you removed.');
    end if;
    update public.packages set name = trim(p_name), schedule_pattern = lower(p_schedule_pattern)::public.schedule_pattern,
           car_sizes = v_sizes, monthly_price_paise = p_monthly_price * 100, description = coalesce(p_description, ''),
           features = coalesce(p_features, '{}'), active = coalesce(p_active, true)
     where id = p_id returning * into v_row;
    if v_row.id is null then perform private.raise_rule('Package not found.'); end if;
    perform private.write_audit('PACKAGE_UPDATED', 'PACKAGE', v_row.id::text, v_row.name);
  end if;
  return private.package_json(v_row);
end $$;

create function public.set_package_car_size(p_package_id uuid, p_car_size text, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_size public.car_size := lower(p_car_size)::public.car_size;
  v_row public.packages;
begin
  perform private.require_admin();
  select * into v_row from public.packages where id = p_package_id for update;
  if v_row.id is null then perform private.raise_rule('Package not found.'); end if;
  if not p_enabled then
    if cardinality(array_remove(v_row.car_sizes, v_size)) = 0 then perform private.raise_rule('A package needs at least one car size.'); end if;
    if exists (select 1 from public.subscriptions s join public.vehicles v on v.id = s.vehicle_id
                where s.package_id = p_package_id and s.status = 'active' and v.car_size = v_size) then
      perform private.raise_rule('Subscribed vehicles still use this car size.');
    end if;
    update public.packages set car_sizes = array_remove(car_sizes, v_size) where id = p_package_id returning * into v_row;
  elsif not (v_size = any (v_row.car_sizes)) then
    update public.packages set car_sizes = array_append(car_sizes, v_size) where id = p_package_id returning * into v_row;
  end if;
  perform private.write_audit('PACKAGE_UPDATED', 'PACKAGE', p_package_id::text, p_car_size || case when p_enabled then ' on' else ' off' end);
  return private.package_json(v_row);
end $$;

-- ============================================================================
-- Cleaners
-- ============================================================================
create function public.admin_list_cleaners(p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object('total', (select count(*) from public.cleaners),
    'items', coalesce((select jsonb_agg(private.cleaner_json(x.id) order by x.name)
                         from (select cl.id, p.full_name as name from public.cleaners cl join public.profiles p on p.id = cl.profile_id
                                order by p.full_name limit private.lim(p_limit) offset private.off(p_offset)) x), '[]'::jsonb));
end $$;

create function public.get_cleaner_workload(p_date date, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object('total', (select count(*) from public.cleaners),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cleaner', private.cleaner_json(x.id),
        'assignedVehicles', (select count(*) from public.vehicles v join public.customers c on c.id = v.customer_id where v.cleaner_id = x.id and c.status = 'active'),
        'vehiclesByBlock', coalesce((select jsonb_object_agg(b.block, b.n) from (
            select c.block, count(*) as n from public.vehicles v join public.customers c on c.id = v.customer_id
             where v.cleaner_id = x.id and c.status = 'active' group by c.block) b), '{}'::jsonb),
        'jobsToday', (select count(*) from private.job_grid(p_date, p_date) g where g.cleaner_id = x.id),
        'completedToday', (select count(*) from private.job_grid(p_date, p_date) g where g.cleaner_id = x.id and g.status = 'completed'),
        'notPresentToday', (select count(*) from private.job_grid(p_date, p_date) g where g.cleaner_id = x.id and g.status = 'vehicle_not_present'))
        order by x.name)
      from (select cl.id, p.full_name as name from public.cleaners cl join public.profiles p on p.id = cl.profile_id
             order by p.full_name limit private.lim(p_limit) offset private.off(p_offset)) x), '[]'::jsonb));
end $$;

create function public.get_cleaner_month_summary(p_cleaner_id uuid, p_cycle text, p_through date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from date := private.cycle_start(p_cycle);
  v_to date := least((v_from + interval '1 month - 1 day')::date, p_through);
begin
  perform private.require_admin_or_cleaner(p_cleaner_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('date', d::date,
      'scheduled', (select count(*) from public.wash_jobs j where j.cleaner_id = p_cleaner_id and j.scheduled_date = d::date),
      'completed', (select count(*) from public.wash_jobs j where j.cleaner_id = p_cleaner_id and j.scheduled_date = d::date and j.status = 'completed'),
      'notPresent', (select count(*) from public.wash_jobs j where j.cleaner_id = p_cleaner_id and j.scheduled_date = d::date and j.status = 'vehicle_not_present'))
      order by d)
    from generate_series(v_from, v_to, interval '1 day') d), '[]'::jsonb);
end $$;

create function public.get_cleaner_week_schedule(p_cleaner_id uuid, p_from date, p_days integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_to date := p_from + least(greatest(coalesce(p_days, 7), 1), 14) - 1;
begin
  perform private.require_admin_or_cleaner(p_cleaner_id);
  return (
    with g as (select * from private.job_grid(p_from, v_to) where cleaner_id = p_cleaner_id and status <> 'cancelled')
    select coalesce(jsonb_agg(jsonb_build_object('date', d::date,
             'total', (select count(*) from g where g.scheduled_date = d::date),
             'byBlock', coalesce((select jsonb_object_agg(b.block, b.n) from (select block, count(*) n from g where g.scheduled_date = d::date group by block) b), '{}'::jsonb))
             order by d), '[]'::jsonb)
      from generate_series(p_from, v_to, interval '1 day') d);
end $$;

create function public.list_assigned_customers(p_cleaner_id uuid, p_search text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_term text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform private.require_admin_or_cleaner(p_cleaner_id);
  return (
    with base as (
      select distinct c.id, p.full_name, p.phone, c.block, c.flat
        from public.customers c join public.profiles p on p.id = c.profile_id
        join public.vehicles v on v.customer_id = c.id
       where v.cleaner_id = p_cleaner_id and c.status = 'active'
         and (v_term is null or lower(p.full_name) like '%' || v_term || '%' or lower(v.registration) like '%' || v_term || '%' or c.flat = v_term)
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'customerId', b.id, 'name', b.full_name, 'phone', b.phone, 'block', b.block, 'flat', b.flat,
          'vehicles', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'registration', v.registration, 'makeModel', v.make_model,
                                                                    'parkingSlot', v.parking_slot,
                                                                    'schedulePattern', upper((private.active_package(v.id)).schedule_pattern::text))
                                                 order by v.registration), '[]'::jsonb)
                         from public.vehicles v where v.customer_id = b.id and v.cleaner_id = p_cleaner_id))
          order by b.block, b.flat)
        from (select * from base order by block, flat limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

create function public.reassign_cleaner_route(p_from_cleaner uuid, p_to_cleaner uuid, p_block text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_moved integer;
begin
  perform private.require_admin();
  if p_from_cleaner = p_to_cleaner then perform private.raise_rule('Choose a different cleaner.'); end if;
  if not exists (select 1 from public.cleaners where id = p_to_cleaner and active) then perform private.raise_rule('Choose an active cleaner.'); end if;
  with moved as (
    update public.vehicles v set cleaner_id = p_to_cleaner
      from public.customers c
     where c.id = v.customer_id and v.cleaner_id = p_from_cleaner and (coalesce(p_block, 'ALL') = 'ALL' or c.block = p_block)
    returning v.id
  )
  select count(*) into v_moved from moved;
  update public.wash_jobs j set cleaner_id = p_to_cleaner
    from public.vehicles v
   where v.id = j.vehicle_id and v.cleaner_id = p_to_cleaner and j.cleaner_id = p_from_cleaner
     and j.status in ('pending', 'in_progress') and j.scheduled_date >= private.today_ist();
  perform private.write_audit('CLEANER_REASSIGNED', 'CLEANER', p_from_cleaner::text, v_moved || ' vehicles to ' || p_to_cleaner::text);
  return v_moved;
end $$;

-- ============================================================================
-- Washes
-- ============================================================================
create function public.get_cleaner_jobs(p_cleaner_id uuid, p_date date, p_status text, p_search text, p_limit integer, p_offset integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_term text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform private.require_admin_or_cleaner(p_cleaner_id);
  -- Today's list must not depend on the nightly job having run.
  if p_date = private.today_ist() then perform public.generate_wash_jobs(p_date); end if;
  return (
    with base as (
      select j.id, c.block, c.flat, j.is_makeup
        from public.wash_jobs j join public.vehicles v on v.id = j.vehicle_id
        join public.customers c on c.id = v.customer_id join public.profiles p on p.id = c.profile_id
       where j.cleaner_id = p_cleaner_id and j.scheduled_date = p_date
         and (coalesce(p_status, 'ALL') = 'ALL' or j.status::text = lower(p_status))
         and (v_term is null or lower(v.registration) like '%' || v_term || '%' or lower(p.full_name) like '%' || v_term || '%' or c.flat = v_term)
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(private.job_json(b.id) order by b.block, b.flat, b.is_makeup)
                           from (select * from base order by block, flat, is_makeup limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

create function public.get_job_summary(p_cleaner_id uuid, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin_or_cleaner(p_cleaner_id);
  if p_date = private.today_ist() then perform public.generate_wash_jobs(p_date); end if;
  return (select jsonb_build_object('date', p_date, 'total', count(*),
            'pending', count(*) filter (where status in ('pending', 'in_progress')),
            'completed', count(*) filter (where status = 'completed'),
            'vehicleNotPresent', count(*) filter (where status = 'vehicle_not_present'))
            from public.wash_jobs where cleaner_id = p_cleaner_id and scheduled_date = p_date);
end $$;

create function public.get_job(p_job_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.wash_jobs j where j.id = p_job_id and (private.is_admin() or j.cleaner_id = private.current_cleaner_id())) then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
  return private.job_json(p_job_id);
end $$;

-- Rule 7 + rule 8 display: date/status/photo only; a missed wash with an approved reschedule shows RESCHEDULED.
create function public.get_customer_history(p_vehicle_id uuid, p_cycle text, p_status text, p_photos_only boolean, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_vehicle_access(p_vehicle_id, false);
  return (
    with base as (
      select j.scheduled_date as date, j.is_makeup,
             case when j.status = 'vehicle_not_present' and exists (
                    select 1 from public.reschedule_requests r where r.missed_job_id = j.id and r.status = 'approved')
                  then 'RESCHEDULED' else upper(j.status::text) end as status,
             ph.id as photo_id
        from public.wash_jobs j left join public.wash_photos ph on ph.wash_job_id = j.id and ph.deleted_at is null
       where j.vehicle_id = p_vehicle_id
         and j.status in ('completed', 'vehicle_not_present', 'cancelled', 'failed', 'rescheduled')
         and (p_cycle is null or (j.scheduled_date >= private.cycle_start(p_cycle) and j.scheduled_date < (private.cycle_start(p_cycle) + interval '1 month')::date))
         and (not coalesce(p_photos_only, false) or ph.id is not null)
    ),
    filtered as (select * from base where coalesce(p_status, 'ALL') = 'ALL' or status = p_status)
    select jsonb_build_object('total', (select count(*) from filtered),
      'items', coalesce((select jsonb_agg(jsonb_build_object('date', f.date, 'status', f.status, 'photoId', f.photo_id) order by f.date desc, f.is_makeup desc)
                           from (select * from filtered order by date desc, is_makeup desc limit private.lim(p_limit) offset private.off(p_offset)) f), '[]'::jsonb)));
end $$;

create function public.get_reschedulable_misses(p_vehicle_id uuid, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_vehicle_access(p_vehicle_id, false);
  return (
    with base as (
      select j.scheduled_date as d from public.wash_jobs j
       where j.vehicle_id = p_vehicle_id and j.status = 'vehicle_not_present'
         and j.scheduled_date >= private.today_ist() - 30 and j.scheduled_date < private.today_ist()
         and not exists (select 1 from public.reschedule_requests r where r.missed_job_id = j.id and r.status <> 'rejected')
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(b.d order by b.d desc) from (select d from base order by d desc limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

-- Rule 1: per vehicle and calendar month, counts status = 'completed' only.
create function public.get_vehicle_progress(p_vehicle_id uuid, p_cycle text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from date := private.cycle_start(p_cycle);
  v_completed integer;
  v_vnp integer;
begin
  perform private.require_vehicle_access(p_vehicle_id, true);
  select count(*) filter (where status = 'completed'), count(*) filter (where status = 'vehicle_not_present')
    into v_completed, v_vnp
    from public.wash_jobs where vehicle_id = p_vehicle_id and scheduled_date >= v_from and scheduled_date < (v_from + interval '1 month')::date;
  return jsonb_build_object('cycle', p_cycle, 'target', 13, 'completed', v_completed, 'vehicleNotPresent', v_vnp,
                            'remaining', greatest(13 - v_completed, 0), 'percent', least(100, round(v_completed * 100.0 / 13))::integer);
end $$;

create function public.get_next_wash_date(p_vehicle_id uuid, p_from date) returns date
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_vehicle_access(p_vehicle_id, true);
  return (select min(g.scheduled_date) from private.job_grid(p_from, p_from + 14) g
           where g.vehicle_id = p_vehicle_id and g.status in ('pending', 'in_progress') and g.cleaner_id is not null);
end $$;

create function public.get_wash_summary(p_from date, p_to date, p_cleaner_id uuid, p_block text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_cleaner_id is null then perform private.require_admin(); else perform private.require_admin_or_cleaner(p_cleaner_id); end if;
  if p_to - p_from > 62 then perform private.raise_rule('Summaries cover at most 62 days.'); end if;
  return (
    with g as (select * from private.job_grid(p_from, p_to)
                where (p_cleaner_id is null or cleaner_id = p_cleaner_id) and (coalesce(p_block, 'ALL') = 'ALL' or block = p_block))
    select jsonb_build_object('from', p_from, 'to', p_to, 'scheduled', count(*),
      'completed', count(*) filter (where status = 'completed'),
      'vehicleNotPresent', count(*) filter (where status = 'vehicle_not_present'),
      'pending', count(*) filter (where status not in ('completed', 'vehicle_not_present')),
      'completionRate', case when count(*) filter (where scheduled_date < private.today_ist() or status <> 'pending') = 0 then 0
                             else round(count(*) filter (where status = 'completed') * 100.0
                                        / count(*) filter (where scheduled_date < private.today_ist() or status <> 'pending'))::integer end)
    from g);
end $$;

create function public.admin_list_photos(p_from date, p_to date, p_block text, p_cleaner text, p_search text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_term text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform private.require_admin();
  return (
    with base as (
      select ph.id, j.scheduled_date, ph.uploaded_at, v.registration, op.full_name as owner_name, c.block, c.flat, ph.uploaded_by, cp.full_name as cleaner_name
        from public.wash_photos ph
        join public.wash_jobs j on j.id = ph.wash_job_id
        join public.vehicles v on v.id = j.vehicle_id
        join public.customers c on c.id = v.customer_id join public.profiles op on op.id = c.profile_id
        join public.cleaners cl on cl.id = ph.uploaded_by join public.profiles cp on cp.id = cl.profile_id
       where ph.deleted_at is null and j.status = 'completed' and j.scheduled_date between p_from and p_to
         and (coalesce(p_block, 'ALL') = 'ALL' or c.block = p_block)
         and (coalesce(p_cleaner, 'ALL') = 'ALL' or ph.uploaded_by::text = p_cleaner)
         and (v_term is null or lower(v.registration) like '%' || v_term || '%' or lower(op.full_name) like '%' || v_term || '%')
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(jsonb_build_object('photoId', b.id, 'date', b.scheduled_date, 'recordedAt', b.uploaded_at,
                                   'registration', b.registration, 'ownerName', b.owner_name, 'block', b.block, 'flat', b.flat,
                                   'cleanerId', b.uploaded_by, 'cleanerName', b.cleaner_name) order by b.uploaded_at desc)
                           from (select * from base order by uploaded_at desc limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

-- ============================================================================
-- Schedules
-- ============================================================================
create function public.get_master_calendar(p_cycle text, p_block text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from date := private.cycle_start(p_cycle);
  v_to date := (private.cycle_start(p_cycle) + interval '1 month - 1 day')::date;
begin
  perform private.require_admin();
  return (
    with g as (select * from private.job_grid(v_from, v_to) where coalesce(p_block, 'ALL') = 'ALL' or block = p_block)
    select coalesce(jsonb_agg(jsonb_build_object('date', d::date,
             'scheduled', (select count(*) from g where g.scheduled_date = d::date),
             'completed', (select count(*) from g where g.scheduled_date = d::date and g.status = 'completed'),
             'notPresent', (select count(*) from g where g.scheduled_date = d::date and g.status = 'vehicle_not_present'),
             'rescheduled', (select count(*) from g where g.scheduled_date = d::date and g.is_makeup)) order by d), '[]'::jsonb)
      from generate_series(v_from, v_to, interval '1 day') d);
end $$;

-- Resident API: identifies the missed wash by vehicle + date (residents can't read wash_jobs).
create function public.request_reschedule_for_date(p_vehicle_id uuid, p_missed_date date, p_requested_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_job uuid;
  v_req uuid;
begin
  if private.current_customer_id() is null or (select status from public.customers where id = private.current_customer_id()) <> 'active' then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
  perform private.require_vehicle_access(p_vehicle_id, false);
  select id into v_job from public.wash_jobs
   where vehicle_id = p_vehicle_id and scheduled_date = p_missed_date and status = 'vehicle_not_present' and not is_makeup;
  if v_job is null then perform private.raise_rule('Choose a missed wash to reschedule.'); end if;
  if exists (select 1 from public.reschedule_requests where missed_job_id = v_job and status <> 'rejected') then
    perform private.raise_rule('This wash already has a reschedule request.');
  end if;
  v_req := public.request_reschedule(v_job, p_requested_date, p_reason);
  return (select private.reschedule_json(r) from public.reschedule_requests r where r.id = v_req);
end $$;

create function public.list_customer_reschedules(p_customer_id uuid, p_vehicle_id uuid, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_admin() or p_customer_id = private.current_customer_id()) then raise exception using errcode = '42501', message = 'Not allowed.'; end if;
  return (
    with base as (
      select r.* from public.reschedule_requests r join public.wash_jobs j on j.id = r.missed_job_id
       where r.customer_id = p_customer_id and (p_vehicle_id is null or j.vehicle_id = p_vehicle_id)
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(private.reschedule_json(b) order by b.created_at desc)
                           from (select * from base order by created_at desc limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

create function public.admin_list_reschedules(p_status text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (
    with base as (select r.* from public.reschedule_requests r where coalesce(p_status, 'ALL') = 'ALL' or r.status::text = lower(p_status))
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(private.reschedule_json(b) || jsonb_build_object(
                              'ownerName', p.full_name, 'registration', v.registration, 'block', c.block, 'flat', c.flat)
                              order by b.status = 'requested' desc, b.created_at desc)
                           from (select * from base order by status = 'requested' desc, created_at desc limit private.lim(p_limit) offset private.off(p_offset)) b
                           join public.wash_jobs j on j.id = b.missed_job_id join public.vehicles v on v.id = j.vehicle_id
                           join public.customers c on c.id = b.customer_id join public.profiles p on p.id = c.profile_id), '[]'::jsonb)));
end $$;

-- ============================================================================
-- Payments
-- ============================================================================
create function private.require_customer_or_admin(p_customer uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_admin() or p_customer = private.current_customer_id()) then raise exception using errcode = '42501', message = 'Not allowed.'; end if;
end $$;

create function public.list_invoices(p_customer_id uuid, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_customer_or_admin(p_customer_id);
  return jsonb_build_object('total', (select count(*) from public.invoices where customer_id = p_customer_id),
    'items', coalesce((select jsonb_agg(private.invoice_json(i) order by i.issued_on desc)
                         from (select * from public.invoices where customer_id = p_customer_id order by issued_on desc
                                limit private.lim(p_limit) offset private.off(p_offset)) i), '[]'::jsonb));
end $$;

create function public.get_invoice(p_invoice_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_inv public.invoices;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if v_inv.id is null then raise exception using errcode = 'P0001', message = 'Invoice not found.'; end if;
  perform private.require_customer_or_admin(v_inv.customer_id);
  return private.invoice_json(v_inv);
end $$;

create function public.list_payments(p_customer_id uuid, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_customer_or_admin(p_customer_id);
  return jsonb_build_object('total', (select count(*) from public.payments where customer_id = p_customer_id),
    'items', coalesce((select jsonb_agg(private.payment_json(x) order by x.created_at desc)
                         from (select * from public.payments where customer_id = p_customer_id order by created_at desc
                                limit private.lim(p_limit) offset private.off(p_offset)) x), '[]'::jsonb));
end $$;

create function public.get_account_summary(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_customer_or_admin(p_customer_id);
  return jsonb_build_object(
    'outstanding', coalesce((select sum(amount_paise - amount_paid_paise) from public.invoices where customer_id = p_customer_id and status <> 'paid'), 0) / 100.0,
    'overdueCount', (select count(*) from public.invoices i where i.customer_id = p_customer_id and private.effective_invoice_status(i) = 'OVERDUE'),
    'lastPayment', (select private.payment_json(x) from public.payments x where x.customer_id = p_customer_id and x.status = 'success' order by x.created_at desc limit 1));
end $$;

create function public.admin_list_invoices(p_cycle text, p_status text, p_search text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_term text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform private.require_admin();
  return (
    with base as (
      select i.*, p.full_name, c.block, c.flat, v.registration
        from public.invoices i join public.customers c on c.id = i.customer_id join public.profiles p on p.id = c.profile_id
        join public.subscriptions s on s.id = i.subscription_id join public.vehicles v on v.id = s.vehicle_id
       where (p_cycle is null or i.cycle_month = private.cycle_start(p_cycle))
         and (coalesce(p_status, 'ALL') = 'ALL' or private.effective_invoice_status(i) = p_status)
         and (v_term is null or lower(p.full_name) like '%' || v_term || '%' or lower(i.number) like '%' || v_term || '%'
              or lower(v.registration) like '%' || v_term || '%')
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(private.invoice_json(i) || jsonb_build_object(
                              'ownerName', b.full_name, 'block', b.block, 'flat', b.flat, 'registration', b.registration,
                              'lastTransactionAt', (select max(x.created_at) from public.payments x where x.invoice_id = b.id))
                              order by b.issued_on desc, b.number)
                           from (select * from base order by issued_on desc, number limit private.lim(p_limit) offset private.off(p_offset)) b
                           join public.invoices i on i.id = b.id), '[]'::jsonb)));
end $$;

create function public.get_collections_summary(p_cycle text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (select jsonb_build_object('cycle', p_cycle,
            'billed', coalesce(sum(amount_paise), 0) / 100.0,
            'collected', coalesce(sum(amount_paid_paise), 0) / 100.0,
            'outstanding', coalesce(sum(amount_paise - amount_paid_paise), 0) / 100.0,
            'overdueInvoices', count(*) filter (where private.effective_invoice_status(i) = 'OVERDUE'))
            from public.invoices i where i.cycle_month = private.cycle_start(p_cycle));
end $$;

-- Override: PAID records the balance as a cash payment at the office.
create or replace function public.override_invoice_status(p_invoice_id uuid, p_status public.invoice_status, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
begin
  perform private.require_admin();
  if coalesce(trim(p_note), '') = '' then perform private.raise_rule('Add a note explaining the override.'); end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null then perform private.raise_rule('Invoice not found.'); end if;
  if p_status = 'paid' and v_inv.amount_paid_paise < v_inv.amount_paise then
    insert into public.payments (invoice_id, customer_id, amount_paise, method, status)
    values (v_inv.id, v_inv.customer_id, v_inv.amount_paise - v_inv.amount_paid_paise, 'cash', 'success');
    update public.invoices set amount_paid_paise = amount_paise where id = v_inv.id;
  end if;
  update public.invoices set status = p_status, override_note = left(trim(p_note), 300) where id = p_invoice_id;
  perform private.write_audit('INVOICE_OVERRIDDEN', 'INVOICE', p_invoice_id::text, upper(p_status::text) || ': ' || p_note);
end $$;

-- Payment audit names match the admin audit screen.
create or replace function public.apply_razorpay_payment(p_order_id text, p_payment_id text, p_amount_paise integer, p_method public.payment_method default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv record;
  v_pay uuid;
begin
  select id, customer_id, amount_paise, amount_paid_paise, status into v_inv
    from public.invoices where razorpay_order_id = p_order_id for update;
  if v_inv.id is null then perform private.raise_rule('No invoice for this order.'); end if;
  if exists (select 1 from public.payments where razorpay_payment_id = p_payment_id and status = 'success') then
    return 'duplicate';
  end if;
  if v_inv.status = 'paid' then return 'already_paid'; end if;
  if p_amount_paise <> v_inv.amount_paise - v_inv.amount_paid_paise then
    perform private.raise_rule('Paid amount does not match the invoice.');
  end if;
  insert into public.payments (invoice_id, customer_id, amount_paise, method, status, razorpay_order_id, razorpay_payment_id)
    values (v_inv.id, v_inv.customer_id, p_amount_paise, p_method, 'success', p_order_id, p_payment_id)
    on conflict (razorpay_payment_id) do update set status = 'success', failure_reason = null, amount_paise = excluded.amount_paise
    returning id into v_pay;
  update public.invoices set amount_paid_paise = amount_paise, status = 'paid' where id = v_inv.id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
    values ((select profile_id from public.customers where id = v_inv.customer_id), 'PAYMENT_SUCCEEDED', 'PAYMENT', v_pay::text, p_payment_id);
  return 'applied';
end $$;

create or replace function public.record_failed_razorpay_payment(p_order_id text, p_payment_id text, p_amount_paise integer, p_reason text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv record;
  v_pay uuid;
begin
  select id, customer_id into v_inv from public.invoices where razorpay_order_id = p_order_id;
  if v_inv.id is null then perform private.raise_rule('No invoice for this order.'); end if;
  insert into public.payments (invoice_id, customer_id, amount_paise, status, razorpay_order_id, razorpay_payment_id, failure_reason)
    values (v_inv.id, v_inv.customer_id, p_amount_paise, 'failed', p_order_id, p_payment_id, left(p_reason, 300))
    on conflict (razorpay_payment_id) do nothing
    returning id into v_pay;
  if v_pay is null then return 'duplicate'; end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
    values ((select profile_id from public.customers where id = v_inv.customer_id), 'PAYMENT_FAILED', 'PAYMENT', v_pay::text, left(p_reason, 300));
  return 'recorded';
end $$;

-- Latest payment for an invoice (used after checkout to return the Payment).
create function public.get_latest_payment(p_invoice_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_customer uuid;
begin
  select customer_id into v_customer from public.invoices where id = p_invoice_id;
  if v_customer is null then raise exception using errcode = 'P0001', message = 'Invoice not found.'; end if;
  perform private.require_customer_or_admin(v_customer);
  return (select private.payment_json(x) from public.payments x where x.invoice_id = p_invoice_id order by x.created_at desc limit 1);
end $$;

-- Monthly invoices for active subscriptions (service role / pg_cron). Idempotent per cycle.
create function public.generate_monthly_invoices(p_cycle date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_cycle)::date;
  v_count integer;
begin
  insert into public.invoices (number, customer_id, subscription_id, cycle_month, issued_on, due_on, amount_paise)
  select 'CC-' || to_char(v_month, 'YYYYMM') || '-' || upper(left(replace(s.id::text, '-', ''), 8)),
         v.customer_id, s.id, v_month, v_month, v_month + 9, k.monthly_price_paise
    from public.subscriptions s join public.vehicles v on v.id = s.vehicle_id join public.packages k on k.id = s.package_id
    join public.customers c on c.id = v.customer_id
   where s.status = 'active' and c.status = 'active' and s.starts_on < (v_month + interval '1 month')::date and k.monthly_price_paise > 0
  on conflict (subscription_id, cycle_month) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Persists OVERDUE for reporting (the API already derives it from due_on).
create function public.mark_overdue_invoices() returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update public.invoices set status = 'overdue' where status = 'due' and due_on < private.today_ist();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ============================================================================
-- Admin
-- ============================================================================
create function public.get_admin_dashboard(p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today jsonb;
  v_week jsonb;
begin
  perform private.require_admin();
  select jsonb_build_object('jobs', count(*), 'completed', count(*) filter (where status = 'completed'),
                            'vnp', count(*) filter (where status = 'vehicle_not_present'),
                            'pending', count(*) filter (where status not in ('completed', 'vehicle_not_present')))
    into v_today from private.job_grid(p_date, p_date);
  select jsonb_build_object('scheduled', count(*), 'completed', count(*) filter (where status = 'completed'))
    into v_week from public.wash_jobs where scheduled_date between p_date - 7 and p_date - 1;
  return jsonb_build_object(
    'date', p_date,
    'totalCustomers', (select count(*) from public.customers where status in ('active', 'paused')),
    'activeVehicles', (select count(*) from public.vehicles v join public.customers c on c.id = v.customer_id where c.status = 'active'),
    'cleanersActive', (select count(*) from public.cleaners where active),
    'pendingApprovals', (select count(*) from public.customers where status = 'pending_approval'),
    'openReschedules', (select count(*) from public.reschedule_requests where status = 'requested'),
    'jobsToday', (v_today ->> 'jobs')::int, 'completedToday', (v_today ->> 'completed')::int,
    'notPresentToday', (v_today ->> 'vnp')::int, 'pendingToday', (v_today ->> 'pending')::int,
    'completionRate', case when (v_week ->> 'scheduled')::int = 0 then 0
                           else round((v_week ->> 'completed')::int * 100.0 / (v_week ->> 'scheduled')::int)::int end,
    'outstandingInvoices', (select count(*) from public.invoices where status <> 'paid'),
    'outstandingAmount', coalesce((select sum(amount_paise - amount_paid_paise) from public.invoices where status <> 'paid'), 0) / 100.0);
end $$;

create function public.get_daily_trend(p_to date, p_days integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from date := p_to - (least(greatest(coalesce(p_days, 14), 1), 31) - 1);
begin
  perform private.require_admin();
  return (
    with g as (select * from private.job_grid(v_from, p_to))
    select coalesce(jsonb_agg(jsonb_build_object('date', d::date,
             'scheduled', (select count(*) from g where g.scheduled_date = d::date),
             'completed', (select count(*) from g where g.scheduled_date = d::date and g.status = 'completed'),
             'notPresent', (select count(*) from g where g.scheduled_date = d::date and g.status = 'vehicle_not_present')) order by d), '[]'::jsonb)
      from generate_series(v_from, p_to, interval '1 day') d);
end $$;

create function public.list_admin_notifications(p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (
    with n as (
      select 'approval-' || c.id as id, 'APPROVAL' as kind, 'Registration awaiting approval' as title,
             p.full_name || ' · Block ' || c.block || ', Flat ' || c.flat as detail, '/admin/customers?tab=pending' as href, c.created_at as at
        from public.customers c join public.profiles p on p.id = c.profile_id where c.status = 'pending_approval'
      union all
      select 'reschedule-' || r.id, 'RESCHEDULE', 'Reschedule request', p.full_name || ' · ' || to_char(r.requested_date, 'DD Mon'),
             '/admin/schedules', r.created_at
        from public.reschedule_requests r join public.customers c on c.id = r.customer_id join public.profiles p on p.id = c.profile_id
       where r.status = 'requested'
      union all
      select 'overdue-' || i.id, 'OVERDUE', 'Invoice overdue', p.full_name || ' · ' || i.number, '/admin/payments', i.due_on::timestamptz
        from public.invoices i join public.customers c on c.id = i.customer_id join public.profiles p on p.id = c.profile_id
       where private.effective_invoice_status(i) = 'OVERDUE'
    )
    select jsonb_build_object('total', (select count(*) from n),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'title', x.title, 'detail', x.detail, 'href', x.href, 'at', x.at) order by x.at desc)
                           from (select * from n order by at desc limit private.lim(p_limit) offset private.off(p_offset)) x), '[]'::jsonb)));
end $$;

create function public.list_audit_log(p_action text, p_entity text, p_role text, p_search text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_term text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform private.require_admin();
  return (
    with base as (
      select a.*, p.full_name, coalesce(upper(p.role::text), 'SYSTEM') as actor_role
        from public.audit_log a left join public.profiles p on p.id = a.actor_id
       -- only actions the admin screen knows; system housekeeping (e.g. photo purges) stays in the table
       where a.action in ('SIGNED_IN', 'REGISTRATION_SUBMITTED', 'REGISTRATION_APPROVED', 'REGISTRATION_REJECTED', 'CUSTOMER_PAUSED',
                          'CUSTOMER_RESUMED', 'CLEANER_ASSIGNED', 'CLEANER_REASSIGNED', 'PACKAGE_CHANGED', 'PACKAGE_SELECTED',
                          'PACKAGE_CREATED', 'PACKAGE_UPDATED', 'WASH_COMPLETED', 'VEHICLE_NOT_PRESENT', 'RESCHEDULE_REQUESTED',
                          'RESCHEDULE_APPROVED', 'RESCHEDULE_REJECTED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'INVOICE_OVERRIDDEN')
         and (coalesce(p_action, 'ALL') = 'ALL' or a.action = p_action)
         and (coalesce(p_entity, 'ALL') = 'ALL' or a.entity_type = p_entity)
         and (coalesce(p_role, 'ALL') = 'ALL' or coalesce(upper(p.role::text), 'SYSTEM') = p_role)
         and (v_term is null or lower(coalesce(p.full_name, '')) like '%' || v_term || '%' or lower(a.entity_id) like '%' || v_term || '%'
              or lower(coalesce(a.detail, '')) like '%' || v_term || '%')
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', b.id::text, 'at', b.created_at, 'actorId', coalesce(b.actor_id::text, 'system'),
          'actorName', coalesce(b.full_name, 'System'), 'actorRole', b.actor_role, 'action', b.action,
          'entityType', b.entity_type, 'entityId', b.entity_id,
          'summary', initcap(replace(lower(b.action), '_', ' ')) || coalesce(' — ' || b.detail, '')) order by b.created_at desc, b.id desc)
        from (select * from base order by created_at desc, id desc limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

-- ============================================================================
-- Privileges
-- ============================================================================
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.user_role(), private.is_admin(), private.current_customer_id(), private.current_cleaner_id()
  to authenticated, service_role;

grant execute on function
  public.register_customer(text, text, text, text, text, public.car_size, text, text, text),
  public.reject_customer(uuid, text),
  public.select_package(uuid, uuid, date),
  public.complete_wash(uuid),
  public.mark_vehicle_not_present(uuid, text),
  public.get_subscription_wash_progress(uuid, date),
  public.get_customer_wash_history(uuid, date, date, integer, integer),
  public.request_reschedule(uuid, date, text),
  public.resolve_reschedule(uuid, boolean, text),
  public.override_invoice_status(uuid, public.invoice_status, text),
  public.authorize_photo_upload(uuid),
  public.authorize_photo_view(uuid),
  public.get_my_session(),
  public.admin_list_customers(text, text, text, text, integer, integer),
  public.get_customer_detail(uuid),
  public.approve_customer(uuid, uuid),
  public.set_customer_status(uuid, text),
  public.assign_cleaner(uuid, uuid),
  public.admin_change_package(uuid, uuid),
  public.count_customers_by_status(),
  public.list_packages(boolean, text, integer, integer),
  public.save_package(uuid, text, text[], text, integer, text, text[], boolean),
  public.set_package_car_size(uuid, text, boolean),
  public.admin_list_cleaners(integer, integer),
  public.get_cleaner_workload(date, integer, integer),
  public.get_cleaner_month_summary(uuid, text, date),
  public.get_cleaner_week_schedule(uuid, date, integer),
  public.list_assigned_customers(uuid, text, integer, integer),
  public.reassign_cleaner_route(uuid, uuid, text),
  public.get_cleaner_jobs(uuid, date, text, text, integer, integer),
  public.get_job_summary(uuid, date),
  public.get_job(uuid),
  public.get_customer_history(uuid, text, text, boolean, integer, integer),
  public.get_reschedulable_misses(uuid, integer, integer),
  public.get_vehicle_progress(uuid, text),
  public.get_next_wash_date(uuid, date),
  public.get_wash_summary(date, date, uuid, text),
  public.admin_list_photos(date, date, text, text, text, integer, integer),
  public.get_master_calendar(text, text),
  public.request_reschedule_for_date(uuid, date, date, text),
  public.list_customer_reschedules(uuid, uuid, integer, integer),
  public.admin_list_reschedules(text, integer, integer),
  public.list_invoices(uuid, integer, integer),
  public.get_invoice(uuid),
  public.list_payments(uuid, integer, integer),
  public.get_account_summary(uuid),
  public.admin_list_invoices(text, text, text, integer, integer),
  public.get_collections_summary(text),
  public.get_latest_payment(uuid),
  public.get_admin_dashboard(date),
  public.get_daily_trend(date, integer),
  public.list_admin_notifications(integer, integer),
  public.list_audit_log(text, text, text, text, integer, integer)
  to authenticated;

grant execute on function
  public.register_uploaded_photo(uuid, text, text, integer),
  public.attach_razorpay_order(uuid, text),
  public.apply_razorpay_payment(text, text, integer, public.payment_method),
  public.record_failed_razorpay_payment(text, text, integer, text),
  public.generate_wash_jobs(date),
  public.generate_monthly_invoices(date),
  public.mark_overdue_invoices(),
  public.claim_expired_photos(integer),
  public.confirm_photos_deleted(uuid[]),
  public.storage_usage_report()
  to service_role;

-- Schedules for invoicing (UTC): invoices on the 1st (00:30 IST) and daily overdue marking.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- runs nightly at 00:30 IST and only acts when the IST date is the 1st
    execute $$ select cron.schedule('carcare-monthly-invoices', '0 19 * * *',
      $job$ select public.generate_monthly_invoices(d) from (select (now() at time zone 'Asia/Kolkata')::date + 1 as d) x
            where extract(day from d) = 1 $job$) $$;
    execute $$ select cron.schedule('carcare-mark-overdue', '15 19 * * *', $job$ select public.mark_overdue_invoices() $job$) $$;
  else
    raise notice 'pg_cron is not available: enable it, then re-run the schedule block of 004.';
  end if;
end
$cron$;
