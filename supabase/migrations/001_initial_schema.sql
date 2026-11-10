-- =============================================================================
-- CarCare — 001_initial_schema.sql
-- Tables, enums, constraints, foreign keys, indexes, and the database functions
-- that enforce the business rules server-side. RLS policies are in 002.
--
-- Capacity (Master Task Document §28): Supabase Free, 500 MB. Rows are lean
-- (enums, dates, short checked text); no photos, blobs or JSON in the database.
-- Money is stored in integer paise. No package prices are seeded.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ----------------------------------------------------------------------------
-- Enums (lower_snake; the frontend maps them to UPPER_SNAKE)
-- ----------------------------------------------------------------------------
create type public.app_role            as enum ('admin', 'cleaner', 'customer');
create type public.customer_status     as enum ('pending_approval', 'active', 'rejected', 'paused');
create type public.car_size            as enum ('hatchback', 'sedan', 'compact_suv', 'large_suv');
create type public.schedule_pattern    as enum ('daily', 'mon_wed_fri', 'tue_fri', 'thu_only');
create type public.subscription_status as enum ('active', 'paused', 'ended');
create type public.wash_status         as enum ('pending', 'in_progress', 'completed', 'vehicle_not_present', 'cancelled', 'failed', 'rescheduled');
create type public.reschedule_status   as enum ('requested', 'approved', 'rejected');
create type public.invoice_status      as enum ('due', 'paid', 'overdue');
create type public.payment_status      as enum ('success', 'failed');
create type public.payment_method      as enum ('upi', 'card', 'net_banking', 'cash');

-- ----------------------------------------------------------------------------
-- 1. profiles — one per auth user; the role lives here, never in the client
-- ----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null default 'customer',
  full_name  text not null check (char_length(full_name) between 1 and 80),
  phone      text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. customers
-- ----------------------------------------------------------------------------
create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null unique references public.profiles (id) on delete cascade,
  block            text not null check (char_length(block) between 1 and 20),
  flat             text not null check (char_length(flat) between 1 and 20),
  status           public.customer_status not null default 'pending_approval',
  rejection_reason text check (char_length(rejection_reason) <= 300),
  approved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index customers_status_created_idx on public.customers (status, created_at desc);
create index customers_block_idx on public.customers (block);

-- ----------------------------------------------------------------------------
-- 3. cleaners
-- ----------------------------------------------------------------------------
create table public.cleaners (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null unique references public.profiles (id) on delete cascade,
  assigned_blocks text[] not null default '{}',
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. vehicles
-- ----------------------------------------------------------------------------
create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete cascade,
  cleaner_id       uuid references public.cleaners (id) on delete set null,
  registration     text not null unique check (registration ~ '^[A-Z0-9-]{6,15}$'),
  car_size         public.car_size not null,
  make_model       text not null check (char_length(make_model) between 1 and 60),
  color            text check (char_length(color) <= 30),
  parking_slot     text not null check (char_length(parking_slot) between 1 and 20),
  time_restriction text check (char_length(time_restriction) <= 120),
  instructions     text check (char_length(instructions) <= 300),
  created_at       timestamptz not null default now()
);
create index vehicles_customer_idx on public.vehicles (customer_id);
create index vehicles_cleaner_idx on public.vehicles (cleaner_id);

-- ----------------------------------------------------------------------------
-- 5. packages — prices are entered by an admin; nothing is seeded
-- ----------------------------------------------------------------------------
create table public.packages (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique check (char_length(name) between 1 and 60),
  schedule_pattern    public.schedule_pattern not null,
  car_sizes           public.car_size[] not null check (cardinality(car_sizes) > 0),
  monthly_price_paise integer not null check (monthly_price_paise >= 0),
  description         text not null default '' check (char_length(description) <= 500),
  features            text[] not null default '{}',
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. subscriptions — one active package per vehicle
-- ----------------------------------------------------------------------------
create table public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  package_id uuid not null references public.packages (id),
  status     public.subscription_status not null default 'active',
  starts_on  date not null,
  ends_on    date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create unique index subscriptions_one_active_per_vehicle on public.subscriptions (vehicle_id) where status = 'active';
create index subscriptions_package_idx on public.subscriptions (package_id);

-- ----------------------------------------------------------------------------
-- 7. wash_jobs — one row per scheduled wash; its status is the completion record
-- ----------------------------------------------------------------------------
create table public.wash_jobs (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  vehicle_id      uuid not null references public.vehicles (id) on delete cascade,
  cleaner_id      uuid references public.cleaners (id) on delete set null,
  scheduled_date  date not null,
  status          public.wash_status not null default 'pending',
  is_makeup       boolean not null default false,
  recorded_at     timestamptz,
  note            text check (char_length(note) <= 300),
  created_at      timestamptz not null default now(),
  -- also serves the (subscription_id, scheduled_date) lookups used for progress
  unique (subscription_id, scheduled_date, is_makeup)
);
create index wash_jobs_cleaner_date_idx on public.wash_jobs (cleaner_id, scheduled_date);
create index wash_jobs_vehicle_date_idx on public.wash_jobs (vehicle_id, scheduled_date desc);
create index wash_jobs_date_status_idx  on public.wash_jobs (scheduled_date, status);

-- ----------------------------------------------------------------------------
-- 8. wash_photos — metadata only; the image lives in the private R2 bucket
-- ----------------------------------------------------------------------------
create table public.wash_photos (
  id           uuid primary key default gen_random_uuid(),
  wash_job_id  uuid not null unique references public.wash_jobs (id) on delete restrict,
  storage_key  text not null unique
               check (storage_key ~ '^[0-9a-f-]{36}/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(webp|jpg)$'),
  content_type text not null check (content_type in ('image/webp', 'image/jpeg')),
  -- 150 KB hard ceiling (§28.2); the photo gateway enforces the same limit
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 153600),
  uploaded_by  uuid not null references public.cleaners (id),
  uploaded_at  timestamptz not null default now(),
  -- at least 60 days, per the agreement; can never be shortened
  retain_until timestamptz not null default (now() + interval '60 days'),
  deleted_at   timestamptz,
  check (retain_until >= uploaded_at + interval '60 days')
);
create index wash_photos_retention_idx on public.wash_photos (retain_until) where deleted_at is null;
create index wash_photos_uploaded_idx on public.wash_photos (uploaded_at desc);

-- ----------------------------------------------------------------------------
-- 9. reschedule_requests
-- ----------------------------------------------------------------------------
create table public.reschedule_requests (
  id             uuid primary key default gen_random_uuid(),
  missed_job_id  uuid not null unique references public.wash_jobs (id) on delete cascade,
  customer_id    uuid not null references public.customers (id) on delete cascade,
  requested_date date not null,
  reason         text not null check (char_length(reason) between 1 and 300),
  status         public.reschedule_status not null default 'requested',
  admin_note     text check (char_length(admin_note) <= 300),
  makeup_job_id  uuid unique references public.wash_jobs (id) on delete set null,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references public.profiles (id) on delete set null
);
create index reschedule_status_idx   on public.reschedule_requests (status, created_at);
create index reschedule_customer_idx on public.reschedule_requests (customer_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 10. invoices
-- ----------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  number            text not null unique check (char_length(number) between 1 and 30),
  customer_id       uuid not null references public.customers (id) on delete restrict,
  subscription_id   uuid not null references public.subscriptions (id) on delete restrict,
  cycle_month       date not null check (extract(day from cycle_month) = 1),
  issued_on         date not null,
  due_on            date not null,
  amount_paise      integer not null check (amount_paise > 0),
  amount_paid_paise integer not null default 0,
  status            public.invoice_status not null default 'due',
  razorpay_order_id text unique,
  override_note     text check (char_length(override_note) <= 300),
  created_at        timestamptz not null default now(),
  unique (subscription_id, cycle_month),
  check (due_on >= issued_on),
  check (amount_paid_paise between 0 and amount_paise)
);
create index invoices_customer_idx on public.invoices (customer_id, issued_on desc);
create index invoices_status_idx   on public.invoices (status, due_on);

-- ----------------------------------------------------------------------------
-- 11. payments — the unique gateway payment id makes crediting idempotent
-- ----------------------------------------------------------------------------
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices (id) on delete restrict,
  customer_id         uuid not null references public.customers (id) on delete restrict,
  amount_paise        integer not null check (amount_paise > 0),
  method              public.payment_method,
  status              public.payment_status not null,
  razorpay_order_id   text,
  razorpay_payment_id text unique,
  failure_reason      text check (char_length(failure_reason) <= 300),
  created_at          timestamptz not null default now()
);
create index payments_invoice_idx  on public.payments (invoice_id);
create index payments_customer_idx on public.payments (customer_id, created_at desc);

-- ----------------------------------------------------------------------------
-- audit_log — append-only, compact (rule 2 and every admin state change)
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (char_length(action) <= 40),
  entity_type text not null check (char_length(entity_type) <= 20),
  entity_id   text not null check (char_length(entity_id) <= 64),
  detail      text check (char_length(detail) <= 300),
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- =============================================================================
-- Private helpers (schema `private` is not exposed through the API)
-- =============================================================================
create function private.user_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create function private.current_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.customers where profile_id = auth.uid()
$$;

create function private.current_cleaner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.cleaners where profile_id = auth.uid() and active
$$;

create function private.today_ist() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create function private.pattern_includes(p public.schedule_pattern, d date) returns boolean
language sql immutable set search_path = '' as $$
  select case p
    when 'daily'       then true
    when 'mon_wed_fri' then extract(dow from d) in (1, 3, 5)
    when 'tue_fri'     then extract(dow from d) in (2, 5)
    when 'thu_only'    then extract(dow from d) = 4
  end
$$;

create function private.write_audit(p_action text, p_entity_type text, p_entity_id text, p_detail text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, left(p_detail, 300))
$$;

create function private.raise_rule(p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = p_message;
end $$;

-- Rule 3: a wash can never become 'completed' without a stored photo.
create function private.enforce_photo_before_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    if not exists (select 1 from public.wash_photos p where p.wash_job_id = new.id and p.deleted_at is null) then
      raise exception using errcode = 'P0001', message = 'A wash cannot be completed without an after-wash photo.';
    end if;
  end if;
  return new;
end $$;
create trigger wash_jobs_photo_required
  before insert or update of status on public.wash_jobs
  for each row execute function private.enforce_photo_before_completion();

-- A recorded outcome (completed / vehicle not present) is final.
create function private.protect_recorded_outcome() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('completed', 'vehicle_not_present') and new.status is distinct from old.status then
    raise exception using errcode = 'P0001', message = 'This wash outcome has already been recorded.';
  end if;
  return new;
end $$;
create trigger wash_jobs_outcome_final
  before update of status on public.wash_jobs
  for each row execute function private.protect_recorded_outcome();

-- The audit log is append-only. Only the retention purge (003) may delete,
-- and only by setting carcare.audit_purge for its own transaction.
create function private.audit_log_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('carcare.audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'The audit log is append-only.';
end $$;
create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function private.audit_log_append_only();

-- =============================================================================
-- Business functions (RPC). All SECURITY DEFINER with explicit authorisation,
-- so the rule lives in the database and not in the browser.
-- =============================================================================

-- Registration: called right after Supabase Auth sign-up. Always pending.
create function public.register_customer(
  p_full_name text, p_phone text, p_block text, p_flat text,
  p_registration text, p_car_size public.car_size, p_make_model text,
  p_color text, p_parking_slot text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid;
begin
  if auth.uid() is null then perform private.raise_rule('Sign in to register.'); end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    perform private.raise_rule('This account is already registered.');
  end if;
  insert into public.profiles (id, role, full_name, phone) values (auth.uid(), 'customer', trim(p_full_name), p_phone);
  insert into public.customers (profile_id, block, flat) values (auth.uid(), trim(p_block), trim(p_flat))
    returning id into v_customer;
  insert into public.vehicles (customer_id, registration, car_size, make_model, color, parking_slot)
    values (v_customer, upper(trim(p_registration)), p_car_size, trim(p_make_model), nullif(trim(p_color), ''), trim(p_parking_slot));
  perform private.write_audit('REGISTRATION_SUBMITTED', 'CUSTOMER', v_customer::text);
  return v_customer;
end $$;

create function public.approve_customer(p_customer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then perform private.raise_rule('Only an admin can approve residents.'); end if;
  update public.customers set status = 'active', approved_at = now(), rejection_reason = null
   where id = p_customer_id and status = 'pending_approval';
  if not found then perform private.raise_rule('This registration is not awaiting approval.'); end if;
  perform private.write_audit('REGISTRATION_APPROVED', 'CUSTOMER', p_customer_id::text);
end $$;

create function public.reject_customer(p_customer_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then perform private.raise_rule('Only an admin can reject residents.'); end if;
  if coalesce(trim(p_reason), '') = '' then perform private.raise_rule('Give a reason for the rejection.'); end if;
  update public.customers set status = 'rejected', rejection_reason = trim(p_reason)
   where id = p_customer_id and status = 'pending_approval';
  if not found then perform private.raise_rule('This registration is not awaiting approval.'); end if;
  perform private.write_audit('REGISTRATION_REJECTED', 'CUSTOMER', p_customer_id::text, p_reason);
end $$;

-- Package choice: approved resident, own vehicle, size-compatible active package.
create function public.select_package(p_vehicle_id uuid, p_package_id uuid, p_starts_on date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_size public.car_size;
  v_sub uuid;
  v_start date := coalesce(p_starts_on, private.today_ist() + 1);
begin
  select v.car_size into v_size
    from public.vehicles v join public.customers c on c.id = v.customer_id
   where v.id = p_vehicle_id and c.profile_id = auth.uid() and c.status = 'active';
  if v_size is null then perform private.raise_rule('Only an approved resident can choose a package for their own car.'); end if;
  if v_start < private.today_ist() then perform private.raise_rule('A package cannot start in the past.'); end if;
  if not exists (select 1 from public.packages where id = p_package_id and active and v_size = any (car_sizes)) then
    perform private.raise_rule('This package is not available for your car size.');
  end if;
  update public.subscriptions set status = 'ended', ends_on = v_start - 1
   where vehicle_id = p_vehicle_id and status = 'active';
  insert into public.subscriptions (vehicle_id, package_id, starts_on) values (p_vehicle_id, p_package_id, v_start)
    returning id into v_sub;
  perform private.write_audit('PACKAGE_SELECTED', 'VEHICLE', p_vehicle_id::text, p_package_id::text);
  return v_sub;
end $$;

-- Rules 1 & 3: completion by the assigned cleaner, only once the photo is stored.
create function public.complete_wash(p_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cleaner uuid := private.current_cleaner_id();
begin
  if v_cleaner is null then perform private.raise_rule('Only a cleaner can complete a wash.'); end if;
  update public.wash_jobs set status = 'completed', recorded_at = now()
   where id = p_job_id and cleaner_id = v_cleaner and status in ('pending', 'in_progress')
     and scheduled_date <= private.today_ist();
  if not found then perform private.raise_rule('This job is not open for you to complete.'); end if;
  perform private.write_audit('WASH_COMPLETED', 'WASH', p_job_id::text);
end $$;

-- Rule 2: Vehicle Not Present closes the job, is audited, and never counts.
create function public.mark_vehicle_not_present(p_job_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cleaner uuid := private.current_cleaner_id();
begin
  if v_cleaner is null then perform private.raise_rule('Only a cleaner can record Vehicle Not Present.'); end if;
  update public.wash_jobs set status = 'vehicle_not_present', recorded_at = now(), note = left(nullif(trim(p_note), ''), 300)
   where id = p_job_id and cleaner_id = v_cleaner and status in ('pending', 'in_progress')
     and scheduled_date <= private.today_ist();
  if not found then perform private.raise_rule('This job is not open for you to update.'); end if;
  perform private.write_audit('VEHICLE_NOT_PRESENT', 'WASH', p_job_id::text, p_note);
end $$;

-- 13-wash milestone: counts status = 'completed' ONLY, for one calendar month.
-- Vehicle Not Present, reschedule requests and approvals never add progress;
-- a makeup wash counts only once it is itself completed (with its photo).
create function public.get_subscription_wash_progress(sub_id uuid, cycle date default null)
returns table (cycle_month date, target integer, completed integer, vehicle_not_present integer, remaining integer, percent integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', coalesce(cycle, private.today_ist()))::date;
  v_target constant integer := 13;
  v_completed integer;
  v_vnp integer;
begin
  if not exists (
    select 1 from public.subscriptions s join public.vehicles v on v.id = s.vehicle_id
     where s.id = sub_id
       and (private.is_admin()
            or v.customer_id = private.current_customer_id()
            or v.cleaner_id = private.current_cleaner_id())
  ) then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;

  select count(*) filter (where j.status = 'completed'),
         count(*) filter (where j.status = 'vehicle_not_present')
    into v_completed, v_vnp
    from public.wash_jobs j
   where j.subscription_id = sub_id
     and j.scheduled_date >= v_month
     and j.scheduled_date < (v_month + interval '1 month')::date;

  return query select v_month, v_target, v_completed, v_vnp,
                      greatest(v_target - v_completed, 0),
                      least(100, round(v_completed * 100.0 / v_target))::integer;
end $$;

-- Rule 7: residents get date, status and photo id — no time, no cleaner.
create function public.get_customer_wash_history(p_vehicle_id uuid, p_from date, p_to date, p_limit integer default 20, p_offset integer default 0)
returns table (wash_date date, status public.wash_status, photo_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and customer_id = private.current_customer_id()) then
    raise exception using errcode = '42501', message = 'Not allowed.';
  end if;
  return query
    select j.scheduled_date, j.status, p.id
      from public.wash_jobs j left join public.wash_photos p on p.wash_job_id = j.id and p.deleted_at is null
     where j.vehicle_id = p_vehicle_id and j.scheduled_date between p_from and p_to
     order by j.scheduled_date desc, j.is_makeup desc
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- Rule 8: a request never changes progress.
create function public.request_reschedule(p_missed_job_id uuid, p_requested_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid := private.current_customer_id();
  v_job record;
  v_id uuid;
begin
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

-- Approval creates a pending makeup job; it counts only when completed with a photo.
create function public.resolve_reschedule(p_request_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req record;
  v_makeup uuid;
begin
  if not private.is_admin() then perform private.raise_rule('Only an admin can resolve reschedules.'); end if;
  select r.id, r.requested_date, j.subscription_id, j.vehicle_id, j.cleaner_id into v_req
    from public.reschedule_requests r join public.wash_jobs j on j.id = r.missed_job_id
   where r.id = p_request_id and r.status = 'requested' for update of r;
  if v_req.id is null then perform private.raise_rule('This request is not awaiting a decision.'); end if;
  if p_approve then
    insert into public.wash_jobs (subscription_id, vehicle_id, cleaner_id, scheduled_date, is_makeup)
      values (v_req.subscription_id, v_req.vehicle_id, v_req.cleaner_id, v_req.requested_date, true)
      returning id into v_makeup;
  end if;
  update public.reschedule_requests
     set status = case when p_approve then 'approved'::public.reschedule_status else 'rejected'::public.reschedule_status end,
         admin_note = left(nullif(trim(p_note), ''), 300), makeup_job_id = v_makeup,
         resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id;
  perform private.write_audit(case when p_approve then 'RESCHEDULE_APPROVED' else 'RESCHEDULE_REJECTED' end, 'RESCHEDULE', p_request_id::text, p_note);
end $$;

create function public.override_invoice_status(p_invoice_id uuid, p_status public.invoice_status, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then perform private.raise_rule('Only an admin can override an invoice.'); end if;
  if coalesce(trim(p_note), '') = '' then perform private.raise_rule('Add a note explaining the override.'); end if;
  update public.invoices set status = p_status, override_note = left(trim(p_note), 300) where id = p_invoice_id;
  if not found then perform private.raise_rule('Invoice not found.'); end if;
  perform private.write_audit('INVOICE_OVERRIDDEN', 'INVOICE', p_invoice_id::text, p_status::text || ': ' || p_note);
end $$;

-- ---------------------------------------------------------------- photos (R2)
-- Called by the photo gateway Worker WITH THE CLEANER'S JWT before it issues a
-- signed upload URL. Returns the only object key the upload may use.
create function public.authorize_photo_upload(p_job_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_job record;
begin
  select j.id, j.vehicle_id, j.scheduled_date into v_job
    from public.wash_jobs j
   where j.id = p_job_id and j.cleaner_id = private.current_cleaner_id()
     and j.status in ('pending', 'in_progress') and j.scheduled_date <= private.today_ist();
  if v_job.id is null then raise exception using errcode = '42501', message = 'Not allowed.'; end if;
  if exists (select 1 from public.wash_photos where wash_job_id = p_job_id) then
    perform private.raise_rule('A photo has already been uploaded for this wash.');
  end if;
  return v_job.vehicle_id::text || '/' || to_char(v_job.scheduled_date, 'YYYY/MM') || '/' || v_job.id::text || '.webp';
end $$;

-- Called by the Worker with the SERVICE ROLE only after the object is stored in
-- R2, so a cleaner can never register a photo that was not actually uploaded.
create function public.register_uploaded_photo(p_job_id uuid, p_storage_key text, p_content_type text, p_size_bytes integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job record;
  v_id uuid;
begin
  select j.id, j.cleaner_id, j.vehicle_id, j.scheduled_date into v_job from public.wash_jobs j where j.id = p_job_id;
  if v_job.id is null or v_job.cleaner_id is null then perform private.raise_rule('Unknown job.'); end if;
  -- the key must be the one authorize_photo_upload issued (extension may be jpg)
  if p_storage_key not in (
    v_job.vehicle_id::text || '/' || to_char(v_job.scheduled_date, 'YYYY/MM') || '/' || v_job.id::text || '.webp',
    v_job.vehicle_id::text || '/' || to_char(v_job.scheduled_date, 'YYYY/MM') || '/' || v_job.id::text || '.jpg'
  ) then
    perform private.raise_rule('Storage key does not match the job.');
  end if;
  insert into public.wash_photos (wash_job_id, storage_key, content_type, size_bytes, uploaded_by)
    values (p_job_id, p_storage_key, p_content_type, p_size_bytes, v_job.cleaner_id)
    returning id into v_id;
  return v_id;
end $$;

-- Called by the Worker WITH THE VIEWER'S JWT before it signs a view URL.
create function public.authorize_photo_view(p_photo_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_key text;
begin
  select p.storage_key into v_key
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

-- ------------------------------------------------------------ payments (Razorpay)
-- SERVICE ROLE only. Links a Razorpay order to an invoice once; a second call
-- returns the existing order so retries never create competing orders.
create function public.attach_razorpay_order(p_invoice_id uuid, p_order_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_existing text;
begin
  update public.invoices set razorpay_order_id = p_order_id
   where id = p_invoice_id and razorpay_order_id is null and status <> 'paid';
  select razorpay_order_id into v_existing from public.invoices where id = p_invoice_id;
  if v_existing is null then perform private.raise_rule('Invoice not found or already paid.'); end if;
  return v_existing;
end $$;

-- SERVICE ROLE only, after the signature has been verified. Idempotent: the
-- invoice row is locked and razorpay_payment_id is unique, so a verify call and
-- one or more webhook deliveries for the same payment credit it exactly once.
create function public.apply_razorpay_payment(p_order_id text, p_payment_id text, p_amount_paise integer, p_method public.payment_method default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv record;
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
    on conflict (razorpay_payment_id) do update set status = 'success', failure_reason = null, amount_paise = excluded.amount_paise;
  update public.invoices set amount_paid_paise = amount_paise, status = 'paid' where id = v_inv.id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
    values (null, 'PAYMENT_CAPTURED', 'INVOICE', v_inv.id::text, p_payment_id);
  return 'applied';
end $$;

-- SERVICE ROLE only. Records a failed attempt once; never downgrades a success.
create function public.record_failed_razorpay_payment(p_order_id text, p_payment_id text, p_amount_paise integer, p_reason text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv record;
begin
  select id, customer_id into v_inv from public.invoices where razorpay_order_id = p_order_id;
  if v_inv.id is null then perform private.raise_rule('No invoice for this order.'); end if;
  insert into public.payments (invoice_id, customer_id, amount_paise, status, razorpay_order_id, razorpay_payment_id, failure_reason)
    values (v_inv.id, v_inv.customer_id, p_amount_paise, 'failed', p_order_id, p_payment_id, left(p_reason, 300))
    on conflict (razorpay_payment_id) do nothing;
  return case when found then 'recorded' else 'duplicate' end;
end $$;

-- ------------------------------------------------------------ scheduled jobs
-- SERVICE ROLE / pg_cron only (scheduled in 003). Idempotent per date.
create function public.generate_wash_jobs(p_date date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.wash_jobs (subscription_id, vehicle_id, cleaner_id, scheduled_date)
  select s.id, s.vehicle_id, v.cleaner_id, p_date
    from public.subscriptions s
    join public.packages k on k.id = s.package_id
    join public.vehicles v on v.id = s.vehicle_id
    join public.customers c on c.id = v.customer_id
   where s.status = 'active' and s.starts_on <= p_date and (s.ends_on is null or s.ends_on >= p_date)
     and c.status = 'active' and private.pattern_includes(k.schedule_pattern, p_date)
  on conflict (subscription_id, scheduled_date, is_makeup) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- =============================================================================
-- Function privileges. Postgres grants EXECUTE to PUBLIC by default and
-- Supabase adds anon/authenticated, so revoke everything and grant explicitly.
-- =============================================================================
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant usage on schema private to authenticated, service_role;
grant execute on function private.user_role(), private.is_admin(), private.current_customer_id(), private.current_cleaner_id()
  to authenticated, service_role;

grant execute on function
  public.register_customer(text, text, text, text, text, public.car_size, text, text, text),
  public.approve_customer(uuid),
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
  public.authorize_photo_view(uuid)
  to authenticated;

grant execute on function
  public.register_uploaded_photo(uuid, text, text, integer),
  public.attach_razorpay_order(uuid, text),
  public.apply_razorpay_payment(text, text, integer, public.payment_method),
  public.record_failed_razorpay_payment(text, text, integer, text),
  public.generate_wash_jobs(date)
  to service_role;
