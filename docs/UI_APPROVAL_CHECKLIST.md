# CarCare — UI Approval Checklist

**Status: UI APPROVED — START BACKEND** (client review of Phase 1 & 2 complete, 2026-11-10)
**UI frozen:** Phase 3, 2026-11-10 — see [CHANGELOG.md](CHANGELOG.md) and the freeze rules below.

All people, phone numbers, vehicles and prices in the build are fictional placeholders.

## Phase 1 — Frontend on the mock service layer

- [x] React 18 + Vite + strict TypeScript + Tailwind + TanStack Query + React Router + Zod
- [x] Client folder layout (app, components, features, services, mock-data, types, schemas, hooks, utils, constants, styles, tests)
- [x] Screens talk to data only through the service interfaces (`useServices()`); ESLint blocks direct imports of mock, mock-data and Supabase code
- [x] Mock service layer with simulated latency, authorisation and an audit trail
- [x] Mock data saved in localStorage; compressed photos saved in IndexedDB

## Phase 2 — Client review and demo readiness

### Screens (24, plus the no-access and not-found pages)

**Resident**
- [x] Sign in
- [x] Registration (`/customer/register`)
- [x] Approval status (`/customer/approval-status`)
- [x] Dashboard with the 13-wash gauge (`/customer/dashboard`)
- [x] Packages (`/customer/packages`)
- [x] Photo gallery (`/customer/photos`)
- [x] Reschedule (`/customer/reschedule`)
- [x] Invoices and simulated payments (`/customer/invoices`)
- [x] Account (`/customer/account`)

**Cleaner**
- [x] Today's jobs (`/cleaner/today`)
- [x] Job detail (`/cleaner/jobs/:id`)
- [x] Wash completion with photo (`/cleaner/jobs/:id/complete`)
- [x] Vehicle Not Present dialog (`/cleaner/jobs/:id/vnp`)
- [x] Weekly schedule (`/cleaner/schedule`)
- [x] My customers (`/cleaner/customers`)
- [x] Targets (`/cleaner/targets`)

**Admin**
- [x] Dashboard (`/admin/dashboard`)
- [x] Customers and pending approvals (`/admin/customers`)
- [x] Cleaner allocation (`/admin/cleaners`)
- [x] Packages (`/admin/packages`)
- [x] Schedules and master calendar (`/admin/schedules`)
- [x] Payments ledger (`/admin/payments`)
- [x] Photo audit (`/admin/photos`)
- [x] Audit log (`/admin/audit-log`)

Each screen is opened as its role by `tests/integration/all-screens.test.tsx` and must load with no error screen and no console errors.

### Business rules

- [x] 1 — Only a completed wash counts toward the 13-wash milestone
- [x] 2 — Vehicle Not Present closes the job, is audited, and never counts
- [x] 3 — A wash can't be completed without an attached, compressed photo
- [x] 4 — Residents see only their own data
- [x] 5 — Cleaners see only their own jobs and residents
- [x] 6 — Admin sees everything
- [x] 7 — The resident gallery shows dates only: no times, no cleaner names or ids
- [x] 8 — Requesting or approving a reschedule adds no progress; only the photo-verified makeup wash does
- [x] 9 — Payments are clearly labelled as simulated

### Demo readiness

- [x] Dev Role Switcher on every screen in `npm run dev` (Admin, Cleaner, Approved and Pending resident, Reset Mock Database)
- [x] Dev server fixed to http://localhost:5174
- [x] Changes survive a page refresh, including one made just before refreshing
- [x] Capacity budget: photo compression (≤ ~150 KB target, 500 KB hard limit), pagination on every list, summary queries for dashboards, monthly rollups for older history
- [x] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass

## Phase 3 — UI freeze

- [x] Layouts in `src/features/` and `src/components/` locked by `docs/ui-freeze.lock.json`
- [x] `npm test` fails if any frozen file is added, removed or changed
- [x] Service layer prepared for Phase 4 (see [PHASE4_SERVICE_CONTRACT.md](PHASE4_SERVICE_CONTRACT.md))

### Freeze rules

1. No redesigns. Layout, styling, copy and flow in the frozen folders stay as approved.
2. Allowed only with sign-off: bug fixes that keep the approved look, and client-approved change requests.
3. For an allowed change, run `npm run freeze:update` and add a CHANGELOG entry saying what changed and who approved it.
