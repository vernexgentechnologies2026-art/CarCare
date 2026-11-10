-- =============================================================================
-- CarCare — 002_rls_policies.sql
-- Default-deny Row Level Security on every table. A table with RLS enabled and
-- no matching policy returns no rows and accepts no writes.
--
--  * anon gets nothing.
--  * Customers read only their own records (rule 4). They have NO direct access
--    to wash_jobs or wash_photos: history comes from get_customer_wash_history,
--    which returns date, status and photo id only (rule 7).
--  * Cleaners read only their own jobs and the residents/vehicles assigned to
--    them (rule 5).
--  * Admins read everything (rule 6).
--  * Business writes go through the SECURITY DEFINER functions in 001. Direct
--    writes are allowed only for admin catalogue/allocation edits, and those
--    are audited by trigger.
--  * service_role (Worker / Edge Functions only) bypasses RLS by design and is
--    never exposed to the browser.
-- Helper calls are wrapped in (select ...) so Postgres evaluates them once per
-- query rather than once per row.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.customers           enable row level security;
alter table public.cleaners            enable row level security;
alter table public.vehicles            enable row level security;
alter table public.packages            enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.wash_jobs           enable row level security;
alter table public.wash_photos         enable row level security;
alter table public.reschedule_requests enable row level security;
alter table public.invoices            enable row level security;
alter table public.payments            enable row level security;
alter table public.audit_log           enable row level security;

-- ----------------------------------------------------------------------------
-- Table privileges (RLS still filters every row)
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant select on all tables in schema public to authenticated;
grant insert, update on public.packages to authenticated;
grant update on public.customers, public.cleaners, public.vehicles, public.subscriptions, public.wash_jobs to authenticated;
grant insert on public.cleaners to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_admin on public.profiles for select to authenticated
  using ((select private.is_admin()));
-- cleaners may read the name/phone of residents whose car they wash (tap-to-call)
create policy profiles_select_assigned_resident on public.profiles for select to authenticated
  using (exists (
    select 1 from public.customers c join public.vehicles v on v.customer_id = c.id
     where c.profile_id = profiles.id and v.cleaner_id = (select private.current_cleaner_id())
  ));
-- no insert/update/delete policies: profiles are created by register_customer
-- and roles can only be changed with the service role (never self-assigned)

-- ----------------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------------
create policy customers_select_self on public.customers for select to authenticated
  using (profile_id = (select auth.uid()));
create policy customers_select_admin on public.customers for select to authenticated
  using ((select private.is_admin()));
create policy customers_select_assigned on public.customers for select to authenticated
  using (exists (
    select 1 from public.vehicles v
     where v.customer_id = customers.id and v.cleaner_id = (select private.current_cleaner_id())
  ));
create policy customers_update_admin on public.customers for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- cleaners
-- ----------------------------------------------------------------------------
create policy cleaners_select_self on public.cleaners for select to authenticated
  using (profile_id = (select auth.uid()));
create policy cleaners_select_admin on public.cleaners for select to authenticated
  using ((select private.is_admin()));
create policy cleaners_insert_admin on public.cleaners for insert to authenticated
  with check ((select private.is_admin()));
create policy cleaners_update_admin on public.cleaners for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- vehicles
-- ----------------------------------------------------------------------------
create policy vehicles_select_owner on public.vehicles for select to authenticated
  using (customer_id = (select private.current_customer_id()));
create policy vehicles_select_assigned on public.vehicles for select to authenticated
  using (cleaner_id = (select private.current_cleaner_id()));
create policy vehicles_select_admin on public.vehicles for select to authenticated
  using ((select private.is_admin()));
create policy vehicles_update_admin on public.vehicles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- packages — any signed-in user sees active packages; admins manage them
-- ----------------------------------------------------------------------------
create policy packages_select_active on public.packages for select to authenticated
  using (active);
create policy packages_select_admin on public.packages for select to authenticated
  using ((select private.is_admin()));
create policy packages_insert_admin on public.packages for insert to authenticated
  with check ((select private.is_admin()));
create policy packages_update_admin on public.packages for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- subscriptions
-- ----------------------------------------------------------------------------
create policy subscriptions_select_owner on public.subscriptions for select to authenticated
  using (exists (select 1 from public.vehicles v
                  where v.id = subscriptions.vehicle_id and v.customer_id = (select private.current_customer_id())));
create policy subscriptions_select_assigned on public.subscriptions for select to authenticated
  using (exists (select 1 from public.vehicles v
                  where v.id = subscriptions.vehicle_id and v.cleaner_id = (select private.current_cleaner_id())));
create policy subscriptions_select_admin on public.subscriptions for select to authenticated
  using ((select private.is_admin()));
create policy subscriptions_update_admin on public.subscriptions for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- wash_jobs — cleaners (own) and admins only; no customer policy (rule 7)
-- ----------------------------------------------------------------------------
create policy wash_jobs_select_cleaner on public.wash_jobs for select to authenticated
  using (cleaner_id = (select private.current_cleaner_id()));
create policy wash_jobs_select_admin on public.wash_jobs for select to authenticated
  using ((select private.is_admin()));
-- admins may reassign a job's cleaner; status changes still pass the 001 triggers
create policy wash_jobs_update_admin on public.wash_jobs for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- wash_photos — metadata; viewing goes through authorize_photo_view + Worker
-- ----------------------------------------------------------------------------
create policy wash_photos_select_cleaner on public.wash_photos for select to authenticated
  using (uploaded_by = (select private.current_cleaner_id()));
create policy wash_photos_select_admin on public.wash_photos for select to authenticated
  using ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- reschedule_requests
-- ----------------------------------------------------------------------------
create policy reschedule_select_owner on public.reschedule_requests for select to authenticated
  using (customer_id = (select private.current_customer_id()));
create policy reschedule_select_admin on public.reschedule_requests for select to authenticated
  using ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- invoices & payments — written only by the service role (Edge Functions)
-- ----------------------------------------------------------------------------
create policy invoices_select_owner on public.invoices for select to authenticated
  using (customer_id = (select private.current_customer_id()));
create policy invoices_select_admin on public.invoices for select to authenticated
  using ((select private.is_admin()));
create policy payments_select_owner on public.payments for select to authenticated
  using (customer_id = (select private.current_customer_id()));
create policy payments_select_admin on public.payments for select to authenticated
  using ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- audit_log — admins read; nobody updates or deletes (trigger in 001)
-- ----------------------------------------------------------------------------
create policy audit_log_select_admin on public.audit_log for select to authenticated
  using ((select private.is_admin()));

-- ----------------------------------------------------------------------------
-- Audit direct admin edits (catalogue / allocation changes)
-- ----------------------------------------------------------------------------
create function private.audit_admin_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    insert into public.audit_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), upper(tg_table_name) || '_' || tg_op, upper(left(tg_table_name, 20)), new.id::text);
  end if;
  return new;
end $$;
revoke execute on function private.audit_admin_edit() from public, anon, authenticated;

create trigger packages_audit      after insert or update on public.packages      for each row execute function private.audit_admin_edit();
create trigger customers_audit     after update           on public.customers     for each row execute function private.audit_admin_edit();
create trigger cleaners_audit      after insert or update on public.cleaners      for each row execute function private.audit_admin_edit();
create trigger vehicles_audit      after update           on public.vehicles      for each row execute function private.audit_admin_edit();
create trigger subscriptions_audit after update           on public.subscriptions for each row execute function private.audit_admin_edit();
