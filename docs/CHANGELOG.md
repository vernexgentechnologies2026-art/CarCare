# Changelog

All notable changes to CarCare. Newest first.

## 1.0.0-rc.1 — Phase 7/8 preparation: staging, production and handover (2026-11-10)

Release candidate for staging UAT. **Not deployed:** staging and production need the Client's accounts. See [HANDOVER_SUMMARY.md](HANDOVER_SUMMARY.md).

### Added
- Deployment configuration:
  - library code split into long-lived cached chunks (app code 20 KB gzipped);
  - `vite preview` serves the deployed security headers;
  - Worker `staging` environment with its own bucket.
- `npm run check:deployment -- <url>` checks a live site: HTTPS redirect, headers and CSP, SPA routing, a clean served bundle, and strict CORS on the gateway and payment functions.
- Playwright `headers-mock` / `headers-production` projects. The built app runs under the CSP with zero violations, and the production profile shows no dev tools or banners.
- CI pipeline (`.github/workflows/ci.yml`) and daily encrypted database backup to private R2 (`db-backup.yml`, 30-day lifecycle).
- `supabase/seed/staging_seed.sql`: fictional UAT data, placeholder prices; refuses to run on a database with real customers. Tested.
- Documents: STAGING_DEPLOYMENT, UAT_TEST_GUIDE, ADMIN_MANUAL, CLEANER_GUIDE, WARRANTY_CHARTER (draft), HANDOVER_SUMMARY.
- Stale-release recovery (`src/app/chunkRecovery.ts`): a tab left open across a deploy reloads once instead of showing an error when it opens another screen. It is guarded against reload loops.
- Playwright runs against built apps (`scripts/preview-build.mjs`) rather than the dev server. This is closer to production and stable on low-memory machines; `CARCARE_E2E=app|headers` runs one half.

### Changed
- Version 1.0.0-rc.1.
- `scripts/bundle-rules.mjs` is shared by the build check and the deployment check.

## Phase 6 — Security audit, performance hardening and testing (2026-11-10)

### Fixed (found by the audit)
- **IDOR — NULL-ownership checks (high).** In 004, `if not (is_admin() or p_id = current_customer_id())` evaluated to NULL for callers without that id, so the check passed. A cleaner could read any resident's record, invoices, payments and reschedules, and a resident could read any cleaner's jobs and schedule. Fixed in 005 with NULL-safe checks; a test inspects every live function for the pattern.
- **Rule 7 leak (medium).** Residents could read their own `vehicles` row through the REST API, including `cleaner_id`. 005 removes direct table access for signed-in users; the browser can only call the vetted functions. RLS stays as a second layer and is still tested.
- **Phone takeover at registration (medium).** Anyone could register a profile with someone else's mobile number. The profile phone is now bound to the account's sign-in address.
- **Paused residents could request reschedules (low).**
- **Production bundle contained the whole mock layer (medium).** A Supabase build shipped demo password `demo1234`, fictional residents, the Dev Role Switcher and mock banners. A build profile in `vite.config.ts` now excludes them; `npm run verify:prod-build` proves it.
- **Database size (§28.3).** A wash cost about 760 B (job + photo + indexes). The photo key is now derived instead of stored: **459 B per wash** measured on 15,000 washes.

### Added
- 005_security_and_capacity.sql.
- EXIF/XMP/IPTC stripping in the photo gateway (JPEG and WebP).
- `public/_headers`: CSP, HSTS, frame, referrer and permissions policies.
- Rate-limit settings in docs/BACKEND_SETUP.md.
- Tests:
  - security audit (IDOR matrix, pending/paused residents, privilege escalation, function-grant snapshot);
  - capacity (row size, EXPLAIN index use, pagination caps);
  - compression budget;
  - Playwright end-to-end at Pixel 5 and 1440×900 (20 tests).

### Changed
- Dependencies upgraded within their major versions for audit fixes:
  - react-router-dom 6.30.6, @supabase/supabase-js 2.119.0;
  - vite 5.4.21, vitest 2.1.9, postcss 8.5.32, eslint 9.39.5;
  - @playwright/test 1.64.0.

### Open (needs approval)
- zod (high) and react-router (moderate) are fixed only in new major versions.
- Dev tooling (vite/vitest) advisories also need majors; they don't ship to users.
- Frozen-UI items:
  - Confirm stays enabled with the previous photo while a retaken photo is still compressing (the old photo is uploaded and the screen doesn't return to Today).
  - Captions still say "simulated" in Supabase mode.
  - The sign-in screen has no `<main>` landmark on phones.

## Phase 5 — Frontend / backend integration (2026-11-10, tested locally; not yet connected to a live project)

### Added
- `src/services/supabase/`: the eight services (`SupabaseAuthService`, `SupabaseCustomerService`, `SupabaseCleanerService`, `SupabaseAdminService`, `SupabaseWashService`, `SupabasePackageService`, `SupabaseScheduleService`, `SupabasePaymentService`) implementing the existing interfaces unchanged.
- `backend.ts` / `supabaseBackend.ts`: one adapter for database calls, sign-in, the R2 photo gateway and Razorpay Checkout (order → checkout → server verification).
- `supabase/migrations/004_app_api.sql`: the database functions the services call, returning the app's exact shapes; audited admin actions; monthly invoices and overdue marking; re-request after a rejected reschedule.
- 19 new tests: 17 run the real services against migrations 001–004 on PostgreSQL 16, signed in as each role; 2 check the Dev Role Switcher flag.

### Changed
- `services/index.ts` returns the Supabase services when `VITE_DATA_SOURCE=supabase` (mock stays the default).
- 004 removes admins' direct table writes; every admin change goes through an audited function.
- No files in `src/features/` or `src/components/` changed (freeze check intact).

## Phase 4 — Backend infrastructure (2026-11-10, written and tested locally; not yet deployed)

### Added
- `supabase/migrations/001_initial_schema.sql`:
  - 11 domain tables plus `audit_log`, with enums, constraints, foreign keys and indexes;
  - functions that enforce the rules: progress, completion, Vehicle Not Present, reschedules, photo authorisation, idempotent Razorpay crediting, and job generation.
- `002_rls_policies.sql`: default-deny RLS on all 12 tables, and no access for `anon`.
- `003_photo_retention_cron.sql`: 60-day photo retention, 13-month audit retention, pg_cron schedules, and a storage usage report.
- `supabase/verify.sql`: post-migration checks.
- Razorpay Edge Functions: create order, verify the HMAC-SHA256 checkout signature (then confirm capture with Razorpay), and an idempotent webhook.
- `workers/photo-gateway/`: Worker for the private R2 bucket `carcare-photos`.
  - 15-minute signed upload and view links.
  - Server-side 150 KB limit and a check that the file is really an image.
  - Daily retention cleanup.
- `src/services/supabase/photoGatewayClient.ts`, which replaces the Supabase Storage helper (the task document doesn't allow Supabase Storage).
- `docs/BACKEND_SETUP.md`: numbered setup steps and the capacity check.
- 37 new tests:
  - 22 run against a real PostgreSQL 16 engine (PGlite);
  - 15 cover the Worker and Razorpay verification.

### Changed
- Signed photo links last 15 minutes (900 s).
- The compressed-photo hard limit is now 150 KB (was 500 KB). If quality reduction isn't enough, the compressor also shrinks the image, down to 720 px on the longest side.

## Phase 3 — UI freeze (2026-11-10)

Client review of Phase 1 & 2 is complete. Status: **UI APPROVED — START BACKEND.**

### Frozen
- All 74 files in `src/features/` and `src/components/` are fingerprinted in `docs/ui-freeze.lock.json`.
- `npm test` now runs `npm run freeze:check` first and fails on any added, removed or changed frozen file.
- No UI redesigns from this point. Approved fixes are re-locked with `npm run freeze:update` and logged here.

### Added
- `docs/UI_APPROVAL_CHECKLIST.md`: Phase 1, 2 and 3 items, all marked complete.
- `docs/PHASE4_SERVICE_CONTRACT.md`: what each service method must do against the live backend, and which rules it must enforce server-side.
- `scripts/ui-freeze.mjs` with the `freeze:check` and `freeze:update` scripts.

## Phase 2 — Client review and demo readiness (2026-11-10)

### Added
- `tests/integration/all-screens.test.tsx`: opens all 26 routes as their role and fails on an error screen or console error.
- Supabase groundwork that doesn't depend on the schema:
  - `supabaseClient.ts`, which reads only the public URL and anon key;
  - status mapping and the date-only gallery filter (`mappers.ts`);
  - error translation (`errors.ts`);
  - the private photo storage helper (`SupabasePhotoService.ts`);
  - 9 tests covering them.
- `@supabase/supabase-js` 2.45.4 (exact version).

### Changed
- The dev server always runs on port 5174.
- `VITE_ENABLE_DEV_TOOLS=false` always hides the Dev Role Switcher. The switcher never shows in Supabase mode, and `.env.example` defaults it to on for the demo.
- Mock data is saved before the page unloads, so a refresh right after an action keeps it.
- Opening a page directly shows a loading spinner rather than logging a router warning.
- ESLint also blocks UI imports of `services/supabase` and `@supabase/*`.

### Postponed
- Live Supabase database and Cloudflare R2. The app runs on `VITE_DATA_SOURCE=mock`.

## Phase 1 — Frontend on the mock service layer (2026-11-10)

- All resident, cleaner and admin screens built on the mock service layer.
- The 9 business rules enforced and tested.
- Capacity budget applied: photo compression, pagination, summary queries and monthly rollups.
- Dev Role Switcher and fictional seed data.
