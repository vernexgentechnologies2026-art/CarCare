# CarCare — Staging & Production Deployment

For the Vernex engineer deploying CarCare. Release **1.0.0-rc.1**.

The rules from the agreement shape this document:
- Staging goes to the client for review first.
- Production is deployed **only after the client's written approval**, on an agreed go-live date, outside peak wash hours.
- Every release has a version number and release notes ([CHANGELOG.md](CHANGELOG.md)) and a rollback plan (§6 below).
- Domain and hosting accounts are registered **in the client's name**. Vernex gets only the access it needs.

Backend setup itself (migrations, Worker, Edge Functions) is in [BACKEND_SETUP.md](BACKEND_SETUP.md). This document covers environments, the frontend host, verification, backups and rollback.

---

## 1. Environments

Each environment has its own Supabase project, R2 bucket, Worker, secrets and Razorpay keys. Nothing is shared.

| | Local | Staging (UAT) | Production |
| --- | --- | --- | --- |
| Frontend | `npm run dev` on :5174 | Cloudflare Pages project `carcare-staging` | Cloudflare Pages project `carcare` |
| URL | http://localhost:5174 | `https://staging.<client-domain>` | `https://app.<client-domain>` |
| Data source | mock | Supabase **staging** project | Supabase **production** project |
| Photos | browser storage | R2 `carcare-photos-staging` via Worker `--env staging` | R2 `carcare-photos` via Worker (default env) |
| Payments | simulated | Razorpay **Test mode** keys | Razorpay **Live** keys (client's account) |
| Data | fictional seed | fictional: [staging_seed.sql](../supabase/seed/staging_seed.sql) | real; never seeded |
| Dev tools | on | **off** | **off** |

## 2. Build settings (Cloudflare Pages)

Create the Pages project from the repository under **Workers & Pages → Create → Pages → Connect to Git**.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | the folder containing `package.json` |
| Environment variable `NODE_VERSION` | `20` |

**Environment variables** (Settings → Environment variables). These are public build-time values. Never add a service-role key, Razorpay secret or signing secret here.

| Variable | Staging | Production |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | `supabase` | `supabase` |
| `VITE_ENABLE_DEV_TOOLS` | `false` | `false` |
| `VITE_SUPABASE_URL` | staging project URL | production project URL |
| `VITE_SUPABASE_ANON_KEY` | staging anon / publishable key | production anon / publishable key |
| `VITE_PHOTO_GATEWAY_URL` | `https://carcare-photo-gateway-staging.<account>.workers.dev` | production Worker URL |
| `VITE_AUTH_EMAIL_DOMAIN` | `users.carcare.local` (or as agreed) | same as staging |

**Things that happen automatically:**
- **Routing:** the build has no `404.html`, so Pages serves `index.html` for deep links such as `/cleaner/today`. Don't add a `_redirects` file.
- **Headers:** `public/_headers` is copied into `dist` and applied by Pages (CSP, HSTS, frame, referrer and permissions policies).
- **Code splitting:**
  - Each screen is its own chunk, so a role downloads only its own screens.
  - Libraries are split out into long-lived cached chunks: React, router, query, forms, icons and Supabase.
  - The app's own code is about 20 KB gzipped (60 KB). A first visit downloads about 193 KB gzipped in total.

**Custom domain:** under Pages → Custom domains, add `staging.<client-domain>` and later `app.<client-domain>`. Then:
- in SSL/TLS → Edge Certificates, turn on **Always Use HTTPS**;
- set the minimum TLS version to **1.2**.

## 3. Staging deployment — step by step

1. **Supabase staging project:** create it, then run migrations `001` → `005` and `supabase/verify.sql` (every row `ok = true`), as in BACKEND_SETUP §1.
2. **Auth:** in Authentication → Providers → Email, keep Email enabled and turn **Confirm email off**. Set the rate limits from BACKEND_SETUP §5.
3. **Staging users:** create the five users listed at the top of `supabase/seed/staging_seed.sql` (Add user, with Auto Confirm ticked). Then run that file in the SQL editor. Share the passwords with the reviewer privately, never in this repository.
4. **R2 bucket:** create `carcare-photos-staging`, private, with no public access and no custom domain.
5. **Worker:** from `workers/photo-gateway/`:
   1. Fill in `[env.staging.vars]` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS=https://staging.<client-domain>`).
   2. Set the secrets: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging` and `npx wrangler secret put URL_SIGNING_SECRET --env staging`.
   3. Deploy: `npx wrangler deploy --env staging`.
6. **Edge Functions (staging project):**
   1. `supabase secrets set RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=… RAZORPAY_WEBHOOK_SECRET=… ALLOWED_ORIGINS=https://staging.<client-domain>` (Test mode keys).
   2. Deploy the three functions as in BACKEND_SETUP §3.
   3. Point a Test-mode webhook at the staging function URL.
7. **Pages:** create the `carcare-staging` project with the staging variables (§2), deploy, and attach `staging.<client-domain>`.
8. **Verify** (§4). Every check must pass before the client gets the link.
9. **Hand to the client:** send the URL, the [UAT_TEST_GUIDE.md](UAT_TEST_GUIDE.md) and the test passwords (separately). Record the date sent: per the agreement, the client reports issues in writing within 7 working days, and a test build with no written response within 5 working days is treated as accepted.

## 4. Verification (run for every staging and production deploy)

```bash
npm run check:deployment -- https://staging.<client-domain> \
  --gateway https://carcare-photo-gateway-staging.<account>.workers.dev \
  --functions https://<staging-ref>.supabase.co/functions/v1
```

This checks, from the outside:
- HTTP → HTTPS redirect;
- HSTS, nosniff, `X-Frame-Options: DENY`, referrer policy, and a CSP with no `unsafe-eval`, framing blocked and scripts limited to the site and Razorpay Checkout;
- deep links served;
- **the JavaScript actually served contains no dev tools, demo credentials, mock data or secret keys**;
- **strict CORS**: the photo gateway and payment functions refuse a foreign origin and allow only the site's own origin.

It currently prints one expected warning: frozen UI captions that still mention simulated payments (client-approved copy change pending).

Locally, before deploying any release: `npm test`, `npm run verify:prod-build` and `npm run test:e2e`. On a low-memory machine, run the end-to-end suite as `CARCARE_E2E=app` then `CARCARE_E2E=headers`.

Then, by hand:
- [ ] `supabase/verify.sql`: every row `ok = true`.
- [ ] Sign in as each role (admin, cleaner, resident). Complete one wash with a photo and open that photo as the resident.
- [ ] Razorpay Test mode: one successful and one failed payment. The invoice is credited exactly once.
- [ ] Supabase REST and Auth CORS are open to any origin by design (the public key is meant for browsers). Protection comes from the function-only API and RLS, which the Phase 6 security tests cover.

## 5. Production cutover — only after written client approval

1. Confirm in writing: the approval e-mail, go-live date and time (outside wash hours), and the release version.
2. Run the backup workflow manually on staging, so the restore procedure is rehearsed (§7.3).
3. Repeat §3 steps 1–7 for production. Differences:
   - production project, bucket `carcare-photos`, default Worker environment (`npx wrangler deploy`);
   - Razorpay **Live** keys from the client's account;
   - **no seed file**;
   - first admin and cleaners are created as in BACKEND_SETUP §1 steps 5–6.
4. Before entering real data, run `npm run check:deployment` against the production URL. Every check must pass.
5. Turn on the daily backup workflow for production (§7) and confirm its first run.
6. Confirm the scheduled jobs:
   - pg_cron: `select jobname, schedule from cron.job;` lists `carcare-generate-wash-jobs`, `carcare-purge-audit-log`, `carcare-monthly-invoices` and `carcare-mark-overdue`;
   - Worker: Cron Trigger `0 21 * * *` (photo retention) under Workers → Triggers.
7. Tag the release (`git tag v1.0.0`) and add the go-live date to CHANGELOG.md.
8. Notify the client that production is live. The 45-day included maintenance period starts on that date ([WARRANTY_CHARTER.md](WARRANTY_CHARTER.md)).

## 6. Rollback

Decide within 15 minutes of a failed release. Prefer the fastest safe layer.

| Layer | How to roll back | Time |
| --- | --- | --- |
| Frontend (Pages) | Pages → Deployments → previous deployment → **Rollback to this deployment** | < 1 min |
| Photo gateway Worker | `npx wrangler deployments list` then `npx wrangler rollback <deployment-id>` (add `--env staging` for staging) | < 1 min |
| Edge Functions | Check out the previous release tag and `supabase functions deploy <name>` | minutes |
| Database | Migrations are **forward-only**. Ship a corrective migration; never edit a migration that already ran. As a last resort, restore the pre-release backup into a new project (§7.3) and repoint the frontend and Worker | hours; data since the backup is lost |

Before any release that contains a migration:
- run the backup workflow manually first;
- state in the release notes whether the frontend can be rolled back on its own (true when the migration only adds things).

## 7. Backups (daily, 30-day retention)

### 7.1 Setup

1. Create an R2 bucket `carcare-backups`, private, separate from photos.
2. Add a lifecycle rule under Settings → Object lifecycle rules: prefix `daily/`, **delete after 30 days**.
3. Create an R2 API token with **Object Read & Write on `carcare-backups` only**.
4. In the GitHub repository, create an environment `production` with the secrets listed at the top of [db-backup.yml](../.github/workflows/db-backup.yml).
   - Use the **Session pooler** connection string from Supabase → Connect. GitHub runners have no IPv6, which the direct connection needs.
   - Store `BACKUP_PASSPHRASE` offline as well, with the client's nominated contact. Without it no backup can be restored.

The workflow runs daily at 02:00 IST. It dumps the `public` and `private` schemas (including grants) plus `auth.users` / `auth.identities` data, compresses and encrypts the dump (AES-256), and uploads it. GitHub e-mails a failed scheduled run to the person who last edited the workflow's schedule; make sure that's an active Vernex address. Treat a failure as a High-priority incident.

### 7.2 What is not in the database backup

Photos live in R2 and are kept 60 days by design. The bucket is not duplicated; R2 is replicated by Cloudflare. The Supabase Free plan has no point-in-time recovery, which is why this daily export exists (Master Task Document §28.5).

### 7.3 Restore (rehearse on staging before go-live, then quarterly)

1. Download the newest `daily/carcare-db-*.tar.gz.gpg` from the bucket.
2. Decrypt and unpack: `gpg --decrypt carcare-db-<stamp>.tar.gz.gpg > backup.tar.gz`, then `tar -xzf backup.tar.gz`.
3. Create a **new** Supabase project, so the broken one is never overwritten.
4. Restore the auth users first, then the application schemas, with triggers disabled for the data load:

   ```bash
   PGOPTIONS='-c session_replication_role=replica' psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f auth-data.sql
   PGOPTIONS='-c session_replication_role=replica' psql "$NEW_DB_URL" -f schema-and-data.sql
   ```

   A notice that the `public` schema already exists is expected; any other error is not.
5. Run `supabase/verify.sql`. Every row must say `ok = true`, which confirms the grants and RLS came back.
6. Point the Pages variables, the Worker `SUPABASE_URL` and the Edge Function secrets at the new project. Redeploy, then run `npm run check:deployment`.
7. Record the restore date and outcome in CHANGELOG.md.

## 8. Operations calendar

| When | What | Where |
| --- | --- | --- |
| Daily 23:30 IST | Create tomorrow's wash jobs | pg_cron `carcare-generate-wash-jobs` |
| Daily 00:30 IST | On the 1st of the month, issue monthly invoices | pg_cron `carcare-monthly-invoices` |
| Daily 00:45 IST | Mark overdue invoices | pg_cron `carcare-mark-overdue` |
| Daily 02:00 IST | Encrypted database backup to R2 | GitHub Actions `db-backup.yml` |
| Daily 02:30 IST | Delete photos past 60-day retention from R2, log it | Worker Cron Trigger → `claim_expired_photos` / `confirm_photos_deleted` |
| Weekly (Sun 03:00 IST) | Drop audit records older than 13 months | pg_cron `carcare-purge-audit-log` |
| Monthly | Check capacity (`select * from storage_usage_report();` as service role, R2 usage in the dashboard) against the upgrade triggers: DB > 70%, R2 > 80% | owner + Vernex |
| Quarterly | Restore rehearsal (§7.3) | Vernex |

The "cleanup expired photos" job is the Worker Cron Trigger, not a single SQL function, because Postgres cannot reach R2. It can only delete photos already past their 60-day retention date. Each run writes a `PHOTOS_PURGED` row to the audit log. To check it ran:

```sql
select created_at, detail from public.audit_log where action = 'PHOTOS_PURGED' order by created_at desc limit 7;
```
