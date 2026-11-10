# Phase 4 — Service contract for the Supabase backend

The UI is frozen. The backend plugs in behind the existing interfaces in `src/services/interfaces/`, and no screen changes.

## How the swap works

1. Write a `Supabase*Service` class for each interface in `src/services/supabase/`.
2. Replace the `supabase` branch in `createServices()` (`src/services/index.ts`). Today it throws "not wired yet".
3. Run the app with `VITE_DATA_SOURCE=supabase` and the public URL and anon key in a local `.env`. A service-role key never goes in a `VITE_` variable.
4. The UI freeze check must still pass. If a screen needs to change to make this work, the plan is wrong.

## Already in place

| File | What it does |
| --- | --- |
| `supabaseClient.ts` | One browser client, created only in Supabase mode |
| `mappers.ts` | Converts `completed` ⇄ `COMPLETED` for every status, and rejects unknown values. `toCustomerWashEntry` keeps only date, status and photo id (rule 7) |
| `errors.ts` | Turns database errors into safe messages. RLS denial → `FORBIDDEN`; a SQL `raise exception` keeps its message |
| `SupabasePhotoService.ts` | Private-bucket upload (images only, no overwrite) and 300-second signed links |

## Needed before writing the services

- [ ] The SQL for migrations 001, 002 and 003: tables, enums, RLS policies and functions
- [ ] The signature and return shape of `get_subscription_wash_progress`
- [ ] How a signed-in user maps to a role and a customer or cleaner record
- [ ] The photo bucket name (Supabase Storage), or the R2 Worker's upload and download links
- [ ] Whether payments stay simulated (rule 9) until the live Razorpay integration is specified

## Method checklist

**Server** means the database must enforce it through RLS, a constraint or a function. The browser can't be trusted for it.

### IAuthService
| Method | Server-side requirement |
| --- | --- |
| `getSession` | Role and customer or cleaner id come from the database, never from the client |
| `login` | Phone + password (or OTP later) through Supabase Auth |
| `logout` | — |
| `registerCustomer` | New customers always start as `pending_approval` |
| `getDemoAccounts` | Returns `[]` (demo personas are mock-only) |

### ICustomerService
| Method | Server-side requirement |
| --- | --- |
| `list`, `getById`, `countByStatus` | Rule 4: a resident reads only their own row. Rule 5: a cleaner reads only assigned residents |
| `approve`, `reject`, `setStatus`, `assignCleaner`, `changePackage` | Admin only, audited |
| `selectPackage` | Active resident only; the package must fit the car size |

### ICleanerService
| Method | Server-side requirement |
| --- | --- |
| `list`, `reassign` | Admin only; reassignment audited |
| `getWorkload`, `getMonthSummary`, `getWeekSchedule`, `listAssignedCustomers` | Rule 5: own data only (admin sees all) |

### IWashService
| Method | Server-side requirement |
| --- | --- |
| `completeWash` | Rule 3: no `completed` row without a stored photo, ideally one function call that checks the photo exists. Rule 1: progress increments only through `completed` |
| `markVehicleNotPresent` | Rule 2: separate status, audited, never counted |
| `getProgress` | From `get_subscription_wash_progress`, which counts `completed` only |
| `getCustomerHistory`, `getMonthlyRollups` | Rule 7: residents get dates only, with no times or cleaner fields (`toCustomerWashEntry`) |
| `getCleanerJobs`, `getJobSummary`, `getJob` | Rule 5: own jobs only |
| `listPhotos`, `getWashSummary` | Admin only (rule 6) |
| `getPhotoUrl` | Signed link valid 300 s; RLS decides who may sign which photo |
| `getReschedulableMisses`, `getNextWashDate` | Own vehicle only |

### IScheduleService
| Method | Server-side requirement |
| --- | --- |
| `createReschedule`, `listReschedulesForCustomer` | Own vehicle only. Rule 8: a request never adds progress |
| `listReschedules`, `resolveReschedule`, `getMasterCalendar` | Admin only. Approval adds no progress; only the photo-verified makeup wash counts |

### IPackageService
| Method | Server-side requirement |
| --- | --- |
| `list` | Everyone can read |
| `create`, `update`, `setCarSizeCompatibility` | Admin only. Prices are fictional placeholders until the client supplies real ones |

### IPaymentService
| Method | Server-side requirement |
| --- | --- |
| `listInvoices`, `getInvoice`, `listPayments`, `getAccountSummary` | Own invoices only |
| `payInvoice` | Rule 9: stays simulated and labelled until Razorpay is specified; a live payment is confirmed only server-side (webhook) |
| `listAllInvoices`, `getCollectionsSummary`, `overrideInvoiceStatus` | Admin only; override audited |

### IAdminService
| Method | Server-side requirement |
| --- | --- |
| `getDashboard`, `getDailyTrend`, `listNotifications`, `listAuditLog` | Admin only. The audit log is append-only, so nobody can update or delete it |

## Definition of done for Phase 4

- Every method above is implemented against the real schema, with no guessed names.
- Rules 1, 2, 3, 7 and 8 are tested against a fake Supabase client, and checked once against a staging project.
- `npm run typecheck`, `npm run lint`, `npm test` (including the freeze check) and `npm run build` all pass.
