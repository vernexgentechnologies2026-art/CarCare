# CarCare — Handover Summary (Release 1.0.0-rc.1)

For the Vernex project owner. Status as of 2026-11-10.

## Where things stand

**Built and verified locally:**
- the complete application;
- the backend (database, photo gateway, payment functions);
- deployment and backup automation;
- all documentation.

**Deployed:** nothing yet. No staging or production environment exists, because creating them needs the Client's Cloudflare, Supabase, Razorpay and domain accounts, which are held in the Client's name. **There is no staging URL to give the Client yet.** The first one comes from step 3 of the go-live path below.

| Area | State |
| --- | --- |
| Frontend: resident, cleaner and admin (24 screens) | Done. UI frozen since Phase 3 (74 files hash-locked). |
| Backend: 12 tables, RLS, ~60 database functions (migrations 001–005) | Done. Tested on PostgreSQL 16 locally, never run on a Supabase project. |
| Photo gateway (Cloudflare Worker + private R2) | Done. Unit-tested, not deployed. |
| Razorpay (order, checkout signature, idempotent webhook) | Done. Unit-tested, never run against Razorpay. |
| Security audit (Phase 6) | Done. 6 issues found and fixed (one high-severity cross-account read). |
| Staging/production deployment | **Ready to run** ([STAGING_DEPLOYMENT.md](STAGING_DEPLOYMENT.md)). Needs the Client's accounts. |
| Daily encrypted backups to R2 | Workflow written ([db-backup.yml](../.github/workflows/db-backup.yml)). Needs the GitHub environment and R2 bucket. **Restore not yet rehearsed.** |
| Photo retention cleanup (60 days) | Worker Cron Trigger, daily 02:30 IST, with logged deletions. Runs once the Worker is deployed. |
| Handover documents | Done (list below). Video walkthroughs to be recorded on the live build. |

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | 0 errors |
| `npm test` (UI freeze check + 176 unit, integration, database/RLS, security and capacity tests) | all pass |
| `npm run test:e2e` (Playwright, Chromium, on built apps served with the deployed headers: 20 flows at phone and desktop size, 3 header/CSP checks) | 23/23 pass (run as two halves locally because of low memory: `CARCARE_E2E=app`, then `CARCARE_E2E=headers`) |
| `npm run verify:prod-build` | passes: no dev tools, demo credentials, mock data or secret keys in the production bundle |
| `npm run check:deployment` against a local production build | passes: headers, CSP, SPA routing, clean served bundle |
| Bundle | 51 files; app code 20 KB gzipped; first visit ≈ 193 KB gzipped; every screen loaded on demand |
| Capacity | 459 B per wash (job + photo + indexes) against the ~500 B budget |

## Go-live path (each step needs the named person)

1. **Owner:** confirm the Client has created, in the Client's name:
   - the domain;
   - a Cloudflare account (Pages, Workers, R2);
   - two Supabase projects (staging and production);
   - a Razorpay account.

   The Client should give Vernex the minimum access needed.
2. **Owner:** review and fill in the [Warranty & Support Charter](WARRANTY_CHARTER.md). Confirm the warranty start date and severity definitions against the signed agreement, and add the support contacts.
3. **Engineer:** deploy staging ([STAGING_DEPLOYMENT.md §3](STAGING_DEPLOYMENT.md)), seed it, run `npm run check:deployment`, and rehearse a backup restore (§7.3).
4. **Owner → Client:** send the staging URL, the [UAT Test Guide](UAT_TEST_GUIDE.md) and the test passwords (separately). Note the date: 7 working days for written feedback; 5 working days of silence counts as acceptance.
5. **Client:** written approval ("approved for production, release …") and an agreed go-live date outside wash hours.
6. **Engineer:** production cutover ([§5](STAGING_DEPLOYMENT.md)), then `check:deployment` and the first backup confirmed.
7. **Owner:** announce go-live. The 45-day included maintenance and the 18-month defect warranty start. Deliver training sessions and record the video walkthroughs.

**Also not set up:** this project folder is not yet a git repository. The CI and backup workflows, release tags and Cloudflare Pages' Git deployment all assume one. Create the Vernex repository (private) and push before staging.

## Decisions waiting on the owner or Client

1. **Frozen-UI fixes** (the Client must approve UI changes):
   - The cleaner can confirm with the *previous* photo while a retaken photo is still compressing.
   - Some captions still say "simulated" for real payments.
   - The sign-in screen lacks a main landmark on phones.
2. **Major-version upgrades:**
   - zod (high advisory; affects only the user's own browser);
   - react-router (moderate open-redirect advisory);
   - dev tooling (vite/vitest, never shipped).
3. **Account self-service:** password reset and creating cleaner/admin accounts are currently done by Vernex support. Building screens for them is a change request.
4. **Capacity:** if most clients choose the Daily plan, 60 days of photos can exceed R2's 10 GB free allowance. Agree the upgrade trigger (R2 > 80%) and who pays.
5. **Not yet built:** monthly history roll-ups (needed in roughly 12–18 months to stay inside the 500 MB database) and vehicle reference photos.

## Documents

| Document | For |
| --- | --- |
| [STAGING_DEPLOYMENT.md](STAGING_DEPLOYMENT.md) | Engineers: environments, deploy, verification, rollback, backups, operations calendar |
| [BACKEND_SETUP.md](BACKEND_SETUP.md) | Engineers: migrations, Worker, Edge Functions, rate limits |
| [UAT_TEST_GUIDE.md](UAT_TEST_GUIDE.md) | Client reviewer: step-by-step acceptance tests |
| [ADMIN_MANUAL.md](ADMIN_MANUAL.md) | Facility admins |
| [CLEANER_GUIDE.md](CLEANER_GUIDE.md) | Cleaners (phone) |
| [WARRANTY_CHARTER.md](WARRANTY_CHARTER.md) | Client and Vernex (draft: owner review first) |
| [CHANGELOG.md](CHANGELOG.md) | Release notes for every phase |

Per the agreement, source code and server credentials stay with Vernex. The Client receives the running service, the user documents and the charter.
