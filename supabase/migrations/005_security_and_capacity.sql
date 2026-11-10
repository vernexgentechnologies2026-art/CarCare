-- =============================================================================
-- CarCare — 005_security_and_capacity.sql  (Phase 6 audit findings)
--
-- Security
--  S1. The browser API is the vetted functions only: signed-in users lose direct
--      SELECT on tables. RLS stays enabled as a second layer. (Before this, a
--      resident could read their own vehicles row through the REST API and see
--      cleaner_id, which rule 7 forbids.)
--  S2. register_customer binds the profile phone to the signed-in account, so
--      nobody can claim another person's mobile number.
--  S3. request_reschedule requires an approved (active) resident, like
--      request_reschedule_for_date already did.
--  S4. NULL-safe ownership checks (found by the IDOR audit). In 004,
--      `if not (is_admin() or p_id = current_customer_id())` evaluates to NULL
--      for a caller with no customer id (e.g. a cleaner), and IF NULL does not
--      raise — so a cleaner could read any resident's record, invoices and
--      payments, and a resident could read any cleaner's jobs. Every check now
--      treats "no id" as "not the owner".
--
-- Capacity (§28.3: wash row + photo row + indexes ≲ 0.5 KB)
--  C1. The R2 object key is derived from the job instead of stored. It was
--      ~95 B per photo row plus a ~160 B unique index (~760 B per wash measured
--      on 15,000 washes; ~490 B after this migration).
--  C2. content_type becomes a boolean; the unused uploaded_at index is dropped.
-- =============================================================================

-- ---------------------------------------------------------------- S1
revoke select on all tables in schema public from authenticated;
alter default privileges in schema public revoke select on tables from authenticated;

-- ---------------------------------------------------------------- C1 / C2
alter table public.wash_photos add column is_jpeg boolean not null default false;
update public.wash_photos set is_jpeg = (content_type = 'image/jpeg');
alter table public.wash_photos drop column storage_key, drop column content_type;
drop index if exists public.wash_photos_uploaded_idx;

-- The only key a job's photo can have: {vehicle}/{yyyy}/{mm}/{job}.{webp|jpg}
create function private.photo_key(p_job_id uuid, p_is_jpeg boolean) returns text
language sql stable security definer set search_path = '' as $$
  select j.vehicle_id::text || '/' || to_char(j.scheduled_date, 'YYYY/MM') || '/' || j.id::text
         || case when p_is_jpeg then '.jpg' else '.webp' end
    from public.wash_jobs j where j.id = p_job_id
$$;

create or replace function public.register_uploaded_photo(p_job_id uuid, p_storage_key text, p_content_type text, p_size_bytes integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cleaner uuid;
  v_jpeg boolean := p_content_type = 'image/jpeg';
  v_id uuid;
begin
  if p_content_type not in ('image/webp', 'image/jpeg') then perform private.raise_rule('Only WebP or JPEG photos are accepted.'); end if;
  select cleaner_id into v_cleaner from public.wash_jobs where id = p_job_id;
  if v_cleaner is null then perform private.raise_rule('Unknown job.'); end if;
  if p_storage_key is distinct from private.photo_key(p_job_id, v_jpeg) then
    perform private.raise_rule('Storage key does not match the job.');
  end if;
  insert into public.wash_photos (wash_job_id, is_jpeg, size_bytes, uploaded_by)
    values (p_job_id, v_jpeg, p_size_bytes, v_cleaner)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.authorize_photo_view(p_photo_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_key text;
begin
  select private.photo_key(p.wash_job_id, p.is_jpeg) into v_key
    from public.wash_photos p
    join public.wash_jobs j on j.id = p.wash_job_id
    join public.vehicles v on v.id = j.vehicle_id
   where p.id = p_photo_id and p.deleted_at is null
     and (private.is_admin()
          or j.cleaner_id = private.current_cleaner_id()
          or v.customer_id = private.current_customer_id());
  if v_key is null then raise exception using errcode = '42501', message = 'Not allowed.'; end if;
  return v_key;
end $$;

create or replace function public.claim_expired_photos(p_limit integer default 500)
returns table (photo_id uuid, storage_key text)
language sql security definer set search_path = '' as $$
  select p.id, private.photo_key(p.wash_job_id, p.is_jpeg)
    from public.wash_photos p
   where p.deleted_at is null and p.retain_until < now()
   order by p.retain_until
   limit least(greatest(p_limit, 1), 1000)
$$;

-- Admin photo audit: newest wash dates first, served by wash_jobs_date_status_idx.
create or replace function public.admin_list_photos(p_from date, p_to date, p_block text, p_cleaner text, p_search text, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_term text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform private.require_admin();
  return (
    with base as (
      select ph.id, j.scheduled_date, ph.uploaded_at, v.registration, op.full_name as owner_name, c.block, c.flat, ph.uploaded_by, cp.full_name as cleaner_name
        from public.wash_jobs j
        join public.wash_photos ph on ph.wash_job_id = j.id and ph.deleted_at is null
        join public.vehicles v on v.id = j.vehicle_id
        join public.customers c on c.id = v.customer_id join public.profiles op on op.id = c.profile_id
        join public.cleaners cl on cl.id = ph.uploaded_by join public.profiles cp on cp.id = cl.profile_id
       where j.status = 'completed' and j.scheduled_date between p_from and p_to
         and (coalesce(p_block, 'ALL') = 'ALL' or c.block = p_block)
         and (coalesce(p_cleaner, 'ALL') = 'ALL' or ph.uploaded_by::text = p_cleaner)
         and (v_term is null or lower(v.registration) like '%' || v_term || '%' or lower(op.full_name) like '%' || v_term || '%')
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(jsonb_build_object('photoId', b.id, 'date', b.scheduled_date, 'recordedAt', b.uploaded_at,
                                   'registration', b.registration, 'ownerName', b.owner_name, 'block', b.block, 'flat', b.flat,
                                   'cleanerId', b.uploaded_by, 'cleanerName', b.cleaner_name) order by b.scheduled_date desc, b.uploaded_at desc)
                           from (select * from base order by scheduled_date desc, uploaded_at desc limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- S2
create or replace function public.register_customer(
  p_full_name text, p_phone text, p_block text, p_flat text,
  p_registration text, p_car_size public.car_size, p_make_model text,
  p_color text, p_parking_slot text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid;
  v_email text;
begin
  if auth.uid() is null then perform private.raise_rule('Sign in to register.'); end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    perform private.raise_rule('This account is already registered.');
  end if;
  -- The account's sign-in address is <mobile>@<domain>; the profile must use that mobile.
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null or split_part(v_email, '@', 1) <> p_phone then
    perform private.raise_rule('The mobile number must match the account being registered.');
  end if;
  insert into public.profiles (id, role, full_name, phone) values (auth.uid(), 'customer', trim(p_full_name), p_phone);
  insert into public.customers (profile_id, block, flat) values (auth.uid(), trim(p_block), trim(p_flat))
    returning id into v_customer;
  insert into public.vehicles (customer_id, registration, car_size, make_model, color, parking_slot)
    values (v_customer, upper(trim(p_registration)), p_car_size, trim(p_make_model), nullif(trim(p_color), ''), trim(p_parking_slot));
  perform private.write_audit('REGISTRATION_SUBMITTED', 'CUSTOMER', v_customer::text);
  return v_customer;
end $$;

-- ---------------------------------------------------------------- S3
create or replace function public.request_reschedule(p_missed_job_id uuid, p_requested_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid := private.current_customer_id();
  v_job record;
  v_id uuid;
begin
  if v_customer is null or (select status from public.customers where id = v_customer) <> 'active' then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
  select j.id, j.status, j.scheduled_date into v_job
    from public.wash_jobs j join public.vehicles v on v.id = j.vehicle_id
   where j.id = p_missed_job_id and v.customer_id = v_customer;
  if v_job.id is null then raise exception using errcode = '42501', message = 'Not allowed.'; end if;
  if v_job.status not in ('vehicle_not_present', 'failed', 'cancelled') then
    perform private.raise_rule('Only a missed wash can be rescheduled.');
  end if;
  if v_job.scheduled_date < private.today_ist() - 30 then perform private.raise_rule('This wash is too old to reschedule.'); end if;
  if p_requested_date <= private.today_ist() or p_requested_date > private.today_ist() + 14 then
    perform private.raise_rule('Choose a date within the next 14 days.');
  end if;
  insert into public.reschedule_requests (missed_job_id, customer_id, requested_date, reason)
    values (p_missed_job_id, v_customer, p_requested_date, trim(p_reason)) returning id into v_id;
  perform private.write_audit('RESCHEDULE_REQUESTED', 'RESCHEDULE', v_id::text);
  return v_id;
end $$;

-- ---------------------------------------------------------------- S4
create or replace function private.require_admin_or_cleaner(p_cleaner uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_admin() or coalesce(p_cleaner = private.current_cleaner_id(), false)) then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
end $$;

create or replace function private.require_customer_or_admin(p_customer uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_admin() or coalesce(p_customer = private.current_customer_id(), false)) then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
end $$;

create or replace function public.get_customer_detail(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean := private.is_admin();
begin
  perform private.require_customer_or_admin(p_customer_id);
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception using errcode = 'P0001', message = 'Customer not found.';
  end if;
  return jsonb_build_object(
    'customer', private.customer_json(p_customer_id),
    'vehicles', coalesce((select jsonb_agg(private.vehicle_json(v.id, not v_admin) order by v.created_at)
                            from public.vehicles v where v.customer_id = p_customer_id), '[]'::jsonb));
end $$;

create or replace function public.list_customer_reschedules(p_customer_id uuid, p_vehicle_id uuid, p_limit integer, p_offset integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_customer_or_admin(p_customer_id);
  return (
    with base as (
      select r.* from public.reschedule_requests r join public.wash_jobs j on j.id = r.missed_job_id
       where r.customer_id = p_customer_id and (p_vehicle_id is null or j.vehicle_id = p_vehicle_id)
    )
    select jsonb_build_object('total', (select count(*) from base),
      'items', coalesce((select jsonb_agg(private.reschedule_json(b) order by b.created_at desc)
                           from (select * from base order by created_at desc limit private.lim(p_limit) offset private.off(p_offset)) b), '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- privileges
revoke execute on function private.photo_key(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.register_uploaded_photo(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.claim_expired_photos(integer) from public, anon, authenticated;
grant execute on function public.register_uploaded_photo(uuid, text, text, integer), public.claim_expired_photos(integer) to service_role;
-- create or replace keeps existing grants for the others (register_customer,
-- request_reschedule, authorize_photo_view, admin_list_photos → authenticated)
