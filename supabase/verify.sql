-- =============================================================================
-- CarCare — post-migration verification. Paste into the Supabase SQL editor
-- after running 001–003. Read-only; every row should show ok = true.
-- =============================================================================
with expected(name) as (
  values ('profiles'), ('customers'), ('cleaners'), ('vehicles'), ('packages'), ('subscriptions'),
         ('wash_jobs'), ('wash_photos'), ('reschedule_requests'), ('invoices'), ('payments'), ('audit_log')
),
t as (
  select e.name,
         c.oid is not null                                as exists,
         coalesce(c.relrowsecurity, false)                as rls_enabled,
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = e.name) as policies,
         has_table_privilege('anon', 'public.' || e.name, 'select') as anon_can_select
    from expected e
    left join pg_class c on c.relname = e.name and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
)
select 'table ' || name as check, exists and rls_enabled and policies > 0 and not anon_can_select as ok,
       format('exists=%s rls=%s policies=%s anon_select=%s', exists, rls_enabled, policies, anon_can_select) as detail
  from t
union all
select 'function ' || f, to_regprocedure(f) is not null, coalesce(to_regprocedure(f)::text, 'missing')
  from unnest(array[
    'public.get_subscription_wash_progress(uuid,date)',
    'public.complete_wash(uuid)',
    'public.mark_vehicle_not_present(uuid,text)',
    'public.get_customer_wash_history(uuid,date,date,integer,integer)',
    'public.authorize_photo_upload(uuid)',
    'public.register_uploaded_photo(uuid,text,text,integer)',
    'public.authorize_photo_view(uuid)',
    'public.apply_razorpay_payment(text,text,integer,public.payment_method)',
    'public.claim_expired_photos(integer)',
    'public.confirm_photos_deleted(uuid[])'
  ]) as f
union all
select 'progress counts completed only',
       pg_get_functiondef('public.get_subscription_wash_progress(uuid,date)'::regprocedure) like '%j.status = ''completed''%', 'function body'
union all
select 'service-only: apply_razorpay_payment',
       not has_function_privilege('authenticated', 'public.apply_razorpay_payment(text,text,integer,public.payment_method)', 'execute'), ''
union all
select 'service-only: register_uploaded_photo',
       not has_function_privilege('authenticated', 'public.register_uploaded_photo(uuid,text,text,integer)', 'execute'), ''
union all
select 'trigger: photo required before completion',
       exists (select 1 from pg_trigger where tgname = 'wash_jobs_photo_required'), ''
union all
select 'cron: ' || j, exists (select 1 from pg_extension where extname = 'pg_cron')
       and exists (select 1 from pg_class where relname = 'job' and relnamespace = to_regnamespace('cron')), 'enable pg_cron, then re-run the 003 cron block'
  from unnest(array['carcare-generate-wash-jobs', 'carcare-purge-audit-log']) as j
order by 1;
