-- =============================================================================
-- CarCare — 003_photo_retention_cron.sql
-- 60-day photo retention and scheduled maintenance (Master Task Document §11,
-- §20.1, §28.2, §28.6).
--
-- Photos live in Cloudflare R2, which Postgres cannot reach. The daily cleanup
-- is therefore split:
--   1. The photo gateway Worker's Cron Trigger (daily) calls
--      claim_expired_photos() with the service role,
--   2. deletes those objects from the private R2 bucket,
--   3. calls confirm_photos_deleted() with the keys it actually removed.
-- Both functions refuse anything still inside the retention period, so a bug
-- or clock skew in the Worker can never delete a photo early. Every purge is
-- logged in audit_log.
--
-- pg_cron (enable it in Dashboard → Database → Extensions first) runs the
-- database-only jobs: tomorrow's wash jobs and audit-log retention.
-- =============================================================================

-- Photos past retention that still need deleting from R2, oldest first, in
-- batches. Safe if two runs overlap: deleting an already-missing R2 object is
-- a no-op and confirm_photos_deleted() only marks rows once.
create function public.claim_expired_photos(p_limit integer default 500)
returns table (photo_id uuid, storage_key text)
language sql security definer set search_path = '' as $$
  select p.id, p.storage_key
    from public.wash_photos p
   where p.deleted_at is null and p.retain_until < now()
   order by p.retain_until
   limit least(greatest(p_limit, 1), 1000)
$$;

-- Marks photos as deleted after the Worker removed them from R2.
-- Rows still inside retention are ignored, never marked.
create function public.confirm_photos_deleted(p_photo_ids uuid[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update public.wash_photos
     set deleted_at = now()
   where id = any (p_photo_ids) and deleted_at is null and retain_until < now();
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
    values (null, 'PHOTOS_PURGED', 'WASH', 'retention', v_count || ' photos past 60-day retention removed from R2');
  end if;
  return v_count;
end $$;

-- Audit records are compact and kept 13 months (manager audit of VNP and
-- admin actions), then purged. Uses the purge flag the append-only trigger checks.
create function private.purge_old_audit_log(p_keep interval default interval '13 months')
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  perform set_config('carcare.audit_purge', 'on', true);
  delete from public.audit_log where created_at < now() - p_keep;
  get diagnostics v_count = row_count;
  perform set_config('carcare.audit_purge', 'off', true);
  return v_count;
end $$;

-- Database size monitor (§28.3): total and per-table sizes for the alert plan.
create function public.storage_usage_report()
returns table (object text, size_bytes bigint)
language sql stable security definer set search_path = '' as $$
  select 'database', pg_database_size(current_database())
  union all
  select c.relname::text, pg_total_relation_size(c.oid)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
$$;

revoke execute on function public.claim_expired_photos(integer)      from public, anon, authenticated;
revoke execute on function public.confirm_photos_deleted(uuid[])     from public, anon, authenticated;
revoke execute on function public.storage_usage_report()             from public, anon, authenticated;
revoke execute on function private.purge_old_audit_log(interval)     from public, anon, authenticated;
grant  execute on function public.claim_expired_photos(integer)      to service_role;
grant  execute on function public.confirm_photos_deleted(uuid[])     to service_role;
grant  execute on function public.storage_usage_report()             to service_role;

-- ----------------------------------------------------------------------------
-- pg_cron schedules (UTC). Skipped with a notice when pg_cron isn't available,
-- e.g. on a local test database; re-run this block after enabling it.
-- ----------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- 23:30 IST: create tomorrow's wash jobs for every active subscription
    execute $$ select cron.schedule('carcare-generate-wash-jobs', '0 18 * * *',
      $job$ select public.generate_wash_jobs(((now() at time zone 'Asia/Kolkata')::date + 1)) $job$) $$;
    -- Sundays 03:00 IST: drop audit records older than 13 months
    execute $$ select cron.schedule('carcare-purge-audit-log', '30 21 * * 6',
      $job$ select private.purge_old_audit_log() $job$) $$;
  else
    raise notice 'pg_cron is not available: enable it, then re-run the schedule block of 003.';
  end if;
end
$cron$;
