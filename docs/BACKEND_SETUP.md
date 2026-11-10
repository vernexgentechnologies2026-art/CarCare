# CarCare — Backend setup (Phase 4)

Manual steps to stand up the backend. Run them in order. Never paste a secret into a file in this repository, a chat, or a terminal log.

## What's in the repo

| Path | What it is |
| --- | --- |
| `supabase/migrations/001_initial_schema.sql` | 11 domain tables + `audit_log`, enums, constraints, foreign keys, indexes, and the rule-enforcing functions |
| `supabase/migrations/002_rls_policies.sql` | Default-deny RLS on all 12 tables; anon has no access |
| `supabase/migrations/003_photo_retention_cron.sql` | 60-day photo retention functions, audit-log retention, pg_cron schedules |
| `supabase/migrations/004_app_api.sql` | The functions the app calls (shaped like the frontend types), invoicing schedules |
| `supabase/migrations/005_security_and_capacity.sql` | Phase 6 audit fixes: function-only API, NULL-safe ownership checks, phone binding, leaner photo rows |
| `supabase/verify.sql` | Read-only checks; every row should say `ok = true` |
| `supabase/functions/razorpay-*` | Edge Functions: create order, verify checkout signature, webhook |
| `workers/photo-gateway/` | Cloudflare Worker for the private R2 bucket `carcare-photos` |

All of it is tested locally against PostgreSQL 16 (PGlite): `npm test` runs `tests/db/*`.

## 1. Supabase database

1. In the Supabase dashboard, go to **Database → Extensions** and enable **pg_cron**.
2. In **SQL Editor**, run `001_initial_schema.sql`, `002_rls_policies.sql`, `003_photo_retention_cron.sql`, `004_app_api.sql`, then `005_security_and_capacity.sql`, each as a separate run. (With the Supabase CLI: `supabase link`, then `supabase db push`.)
3. Run `supabase/verify.sql`. Every row must show `ok = true`.
4. Under **Authentication → Providers → Email**, keep Email enabled and turn **Confirm email off**. Residents sign in with mobile + password; the app stores them as `<mobile>@<VITE_AUTH_EMAIL_DOMAIN>` (default `users.carcare.local`), so no SMS provider is needed yet.
5. Create the first admin. Sign up the admin user, then run this once in the SQL editor with the real user id:
   `insert into public.profiles (id, role, full_name, phone) values ('<auth user id>', 'admin', '<name>', '<10-digit mobile>');`
   Create that admin's auth user with the email `<10-digit mobile>@users.carcare.local` (or your chosen domain) so they can sign in with their mobile number.
6. Create cleaners the same way (`role = 'cleaner'`), then add a `public.cleaners` row with their `profile_id` and `assigned_blocks`.

> **If migrations 001–003 were already run in this project**, compare first. These files create the tables from scratch and will fail on existing ones. Don't drop live data. Send me the existing SQL instead.

## 2. Cloudflare R2 + photo gateway

1. In the Cloudflare dashboard, create the R2 bucket **`carcare-photos`**. Leave public access **off** and don't attach a custom domain.
2. In `workers/photo-gateway/wrangler.toml`, fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY` (both public) and `ALLOWED_ORIGINS`.
3. Set the secrets. Each command prompts for the value, so it's never typed on the command line:
   - `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
   - `npx wrangler secret put URL_SIGNING_SECRET` (a random value of at least 32 characters)
4. Deploy with `npx wrangler deploy`, run from `workers/photo-gateway/`. The daily Cron Trigger for the 60-day cleanup is included.
5. Put the Worker URL in the frontend `.env` as `VITE_PHOTO_GATEWAY_URL`.
6. Add a Cloudflare **Rate limiting rule** (Security → WAF) on the Worker route: `/v1/uploads` and `/v1/photos/*`, 30 requests per minute per IP, action Block for 1 minute.

## 3. Razorpay

1. Use **Test mode** keys until the client signs off.
2. Set the Edge Function secrets with `supabase secrets set`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ALLOWED_ORIGINS`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.
3. Deploy: `supabase functions deploy razorpay-create-order`, `razorpay-verify`, and `razorpay-webhook --no-verify-jwt`.
4. In the Razorpay Dashboard → Webhooks, add `https://<project>.supabase.co/functions/v1/razorpay-webhook` with events `payment.captured`, `payment.failed` and `order.paid`, and the same webhook secret.

## How the rules are enforced server-side

| Rule | Where |
| --- | --- |
| 1. Only completed washes count | `get_subscription_wash_progress` counts `status = 'completed'` only |
| 2. Vehicle Not Present | `mark_vehicle_not_present`: audited, final, never counted |
| 3. Photo required | Trigger `wash_jobs_photo_required`. A photo row is created only by the Worker after the object is stored in R2 |
| 4–6. Access | RLS in 002. Customers have no direct access to `wash_jobs` or `wash_photos` |
| 7. Dates only | `get_customer_wash_history` returns `wash_date, status, photo_id` |
| 8. Reschedules | Approval creates a pending makeup job; it counts only once completed with a photo |
| Payments | Signature verified, then the payment status is confirmed with Razorpay. Crediting is idempotent (row lock + unique payment id) |

## Capacity check (§28) — needs an owner decision

| Scenario | Photos kept (60 days) | At 150 KB (hard max) | At ~100 KB (typical) | R2 free (10 GB) |
| --- | --- | --- | --- | --- |
| Realistic mix, ~13 washes/client/month | ~39,000 | ~5.6 GB | ~3.7 GB | fits |
| Every client on Daily (~30/month) | ~90,000 | ~12.9 GB | ~8.6 GB | **does not fit** at the hard max; over the 8 GB target even at 100 KB |

Retention is not shortened and security is not weakened to fit. Agree an upgrade trigger with the owner: R2 over 80% (8 GB) means moving to paid R2, at roughly the per-GB rate on the current Cloudflare price list.

Database: about 0.3–0.5 KB per wash row including its photo row and indexes. 39,000 washes a month is roughly 12–20 MB a month, so the 500 MB plan needs the monthly roll-up/purge (not yet built) within about 12–18 months. `storage_usage_report()` returns the sizes for monitoring.

Free-tier risks to raise with the owner (§28.5):
- Supabase Free projects pause when inactive.
- The Free plan has no automatic backups or point-in-time recovery.
- Free-tier limits and commercial-use terms can change.
- Upgrade triggers and who pays for them still need to be agreed.

## 4. Switch the app to the live backend

In the frontend `.env` (never committed):

```
VITE_DATA_SOURCE=supabase
VITE_SUPABASE_URL=<project URL>
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PHOTO_GATEWAY_URL=<Worker URL>
VITE_ENABLE_DEV_TOOLS=false
```

Run `npm run build`. A Supabase build contains no mock code or demo accounts.

## 5. Rate limits and headers (§26.2) — set before go-live

| Endpoint | Where to set it | Suggested limit |
| --- | --- | --- |
| Sign-in, sign-up | Supabase → Authentication → Rate Limits | Sign-ins/sign-ups per 5 min per IP: 30; token refreshes: default |
| Upload and view links (`/v1/uploads`, `/v1/photos/*`) | Cloudflare → Security → WAF → Rate limiting rules | 30 / min per IP, block 1 min |
| Payment functions (`razorpay-create-order`, `razorpay-verify`) | Cloudflare in front of the custom domain, or Supabase → Edge Functions → rate limits when available | 10 / min per IP |
| Razorpay webhook | No rate limit (Razorpay retries); authenticated by HMAC signature | — |

Security headers and the Content Security Policy ship in `public/_headers` (Cloudflare Pages / Netlify format). On another host, copy the same headers into its configuration. If the photo gateway runs on a custom domain, replace `https://*.workers.dev` in the CSP with that host.

Run `npm run verify:prod-build` before every release. It builds with the production settings and fails if dev tools, mock data, demo credentials, mock banners or secret keys reach the bundle.
