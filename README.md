# CarCare — Residential Car-Wash Management

**Phase 1: production-grade frontend on a mock service layer**, for client review before the UI freeze and backend integration.

> No backend, no live payments, no real uploads. All people, phone numbers, vehicles and prices are fictional placeholders. The UI is approved; the live Supabase and R2 backend is postponed, so the app runs on the mock layer (`VITE_DATA_SOURCE=mock`).

## Run it

```bash
npm install
npm run dev          # http://localhost:5174
npm test             # UI freeze check, then vitest (unit + integration)
npm run typecheck    # tsc --noEmit (strict)
npm run lint
npm run build
```

Node 20+. The test runner uses a single worker so it fits on low-memory machines.

### Review accounts and the Dev Role Switcher

In `npm run dev`, a **Dev Role Switcher** dock sits at the bottom of every screen, including sign-in. It offers:

- **Customer (Approved)** — Arjun Raghavan, A-101 (two cars)
- **Customer (Pending Approval)** — Meera Subramanian, held on the approval-status screen
- **Cleaner** — Murugan S, Block A (today's round not started)
- **Admin** — Facility Admin
- **Reset Mock Database** — restores the seed data and clears local photos and the session

To sign in manually, use the password `demo1234` with any of these numbers:

| Persona | Mobile |
| --- | --- |
| Admin | 90000 00001 |
| Cleaner | 90000 00101 |
| Customer (Approved) | 90000 01001 |
| Customer (Pending) | 90000 02181 |

For a review build outside `vite dev`, set `VITE_ENABLE_DEV_TOOLS=true`.

## Screens

| Role | Route | Highlights |
| --- | --- | --- |
| Customer | `/customer/register` | Owner, phone, registration, make/model, size class (Hatchback / Sedan / Compact SUV / Large SUV), block, flat, parking slot. Zod-validated. |
| | `/customer/approval-status` | "Registration Under Review" banner, details, contact info, **Check status** refresh. |
| | `/customer/dashboard` | Vehicle pill, 13-wash radial gauge (X / 13, remaining, %), upcoming wash with service window, quick actions, recent history. |
| | `/customer/packages` | Filtered to the car size; the 4 contracted schedules only; pricing cards with features. |
| | `/customer/photos` | Photo card grid with **date only**, lightbox, and archived monthly rollups. |
| | `/customer/reschedule` | Dropdown of eligible missed dates, date picker, status log. |
| | `/customer/invoices` | Outstanding balance, invoice table, **Pay now** with *Simulate success* / *Simulate failure*. |
| Cleaner | `/cleaner/today` | Sticky header ("X / Y Completed"), filter chips, monospace plates, slot, time restrictions, tap-to-call. 44px+ targets. |
| | `/cleaner/jobs/:id` | Vehicle, slot, resident instructions, status. **Complete Wash & Upload Photo** / **Vehicle Not Present**. |
| | `/cleaner/jobs/:id/complete` | Camera/file picker, client-side compression ("Compressed: 114 KB"), preview and retake. Confirm stays disabled until a valid photo is attached. |
| | `/cleaner/jobs/:id/vnp` | Confirmation dialog: does not count as a wash, logged for manager audit. |
| | `/cleaner/schedule` | 7-day carousel of scheduled cars per block. |
| | `/cleaner/customers` | Searchable, paginated assigned residents. |
| | `/cleaner/targets` | Monthly progress bar, washes vs assigned goal, VNP count. |
| Admin | `/admin/dashboard` | KPIs (customers, today's washes, completion rate, cleaners active, outstanding invoices), 14-day trend, urgent approvals. |
| | `/admin/customers` | Tabs "All Residents" / "Pending Approvals" (count badge), approve/reject modals, inspection drawer. |
| | `/admin/cleaners` | Roster, daily counts, block coverage matrix, **Reassign Cleaner**. |
| | `/admin/packages` | Package grid with car-size compatibility toggles and edit modal. |
| | `/admin/schedules` | Reschedule review queue and master calendar. |
| | `/admin/payments` | Ledger with Paid / Outstanding / Overdue filters, transaction dates, **manual status override**. |
| | `/admin/photos` | Photo grid filtered by date, block, cleaner and customer; audit timestamps and cleaner metadata. |
| | `/admin/audit-log` | Append-only activity log of every state change. |

The admin shell has a 240px sidebar (a drawer on mobile) and a top header with quick stats, notifications and profile. Resident screens are mobile-first and centred at `max-w-md` on desktop.

## The 9 business rules — where they're enforced and tested

| # | Rule | Enforced in | Verified by |
| --- | --- | --- | --- |
| 1 | Only `COMPLETED` increments the 13-wash milestone | `utils/washProgressCalculator.ts` (`progressIncrement`, `computeProgress`) | `wash-progress.test.ts`, `mock-services.test.ts` |
| 2 | Vehicle Not Present is distinct, writes an audit record, ends the job, doesn't count | `MockWashService.record`, `VehicleNotPresentDialog` | `mock-services.test.ts`, `app.test.tsx` |
| 3 | No completion without a selected, compressed, previewed and attached photo | `utils/washCompletionRules.ts`, `ImageUploadZone`, `WashCompletionPage`, service re-check | `photo-validation.test.ts`, `app.test.tsx` |
| 4 | Customers see only their own data | `assertCustomerAccess` on every customer call | `mock-services.test.ts` |
| 5 | Cleaners see only their own jobs and customers | `assertCleanerScope` / `assertSelfOrAdmin` | `mock-services.test.ts` |
| 6 | Admin sees everything | Admin-only listings across blocks, photos and ledgers | `mock-services.test.ts` |
| 7 | Customer gallery shows dates only — no times, cleaner names or ids | `CustomerWashEntry` type, `toCustomerEntry`, `vehicleDetail(…, forCustomer)` | `wash-progress.test.ts`, `mock-services.test.ts`, `app.test.tsx` |
| 8 | Reschedule request or approval never adds progress; only the photo-verified makeup wash does | `MockScheduleService`, `displayStatus` (`RESCHEDULED`) | `wash-progress.test.ts`, `mock-services.test.ts` |
| 9 | Payments are clearly simulated | `MockPaymentNotice`, `simulated` flag, `MOCK-` references, "(simulated)" result titles | `mock-services.test.ts`, `app.test.tsx` |

## Capacity budget (Section 28)

- **Photo compression**: longest side ≤ 1280px, WebP (JPEG fallback) at quality 0.8, stepping down until the file is ≤ ~150 KB. Anything still over 500 KB is rejected. The compressed size is shown before upload. (`utils/photoCompressor.ts`)
- **Pagination everywhere**: every list query takes `{ page, limit }` and returns `{ items, total, page, limit, hasMore }`, with limits capped at 100. Cleaner jobs and the photo gallery load in pages ("Load more").
- **Summary endpoints**: dashboards use `getDashboard`, `getJobSummary`, `getWashSummary`, `getCollectionsSummary`, `getMonthSummary`, `getWeekSchedule` and `getMasterCalendar` — never raw history.
- **History rollups**: detailed rows cover two months; older months are `MonthlyWashRollup` summaries shown under "Earlier months".

## Architecture

```
src/
  app/          layouts (Root, Customer, Cleaner, Admin) · providers · routes (lazy, guarded)
  components/   ui · forms (FormField, SelectField, ImageUploadZone) · shared (DevRoleSwitcher, AppHeader, BottomNav, …) · feedback
  features/     auth · customer · cleaner · admin · packages · schedules · washes · payments
  services/     interfaces (I*Service, ServiceRegistry) · mock (Mock*Service, store, photo vault) · index.ts (factory)
  mock-data/    deterministic seed: accounts, fixtures, wash history, rollups, invoices, audit
  types/        domain models, enums, DTOs
  schemas/      Zod schemas
  hooks/        useAuth, useToast, useJobs, useWashProgress, useCleaners, queryKeys
  utils/        washProgressCalculator, washCompletionRules, photoCompressor, scheduleRules, packageEligibility, …
  constants/    schedules, vehicle sizes, business limits, labels, theme tokens
  styles/       index.css (Tailwind reads tokens from constants/theme.ts)
tests/
  unit/         wash-progress, photo-validation, schedule-validation, package-eligibility, domain-rules, mock-services
  integration/  full-app flows against an isolated mock backend
```

- **Service abstraction:** screens reach data only through `useServices()`. ESLint fails if UI code imports `services/mock` or `mock-data`.
- **Mock layer:**
  - 150–300 ms simulated latency (about 1 s for payments).
  - Deep-cloned responses, so the UI can't mutate the store.
  - Every call is authorised and every change audited.
  - Mutable state lives in localStorage; compressed photos live in IndexedDB.
- **Enum casing:** status values are UPPER_SNAKE (`COMPLETED`, `VEHICLE_NOT_PRESENT`). The Phase 5 adapter maps them to the database's lower_snake values.

## Phase 5 swap

1. Implement `services/supabase/*` against the interfaces in `services/interfaces`.
2. Add a `supabase` branch to `createServices()` in `services/index.ts`.
3. Move audit writes and photo signing server-side.
4. Run `tests/unit/mock-services.test.ts` against the new implementation.

No screen changes should be needed. The UI is frozen (Phase 3): `npm test` fails if any file in `src/features/` or `src/components/` changes. See `docs/UI_APPROVAL_CHECKLIST.md` and `docs/PHASE4_SERVICE_CONTRACT.md`.

## Assumptions to confirm with the client

- The 13-wash milestone is counted **per calendar month**.
- Residents choose their package **after approval**; registration doesn't include one. Each schedule is offered as a "Hatch & Sedan" tier and an "SUV" tier.
- Service windows per block are placeholders (e.g. Block A, 5:30–7:30 AM).
- Registration also asks for a password so residents can sign in; Phase 5 may switch to OTP.
- Reschedules: missed washes from the last 30 days, to a date within 14 days, with admin approval.
