/**
 * Data-transfer objects: query inputs and view models exchanged between the UI
 * and service interfaces. Backend-agnostic — Phase 5 implementations return the
 * same shapes. Every list query extends `PageQuery` (no unbounded reads).
 */
import type {
  AuditAction,
  AuditEntityType,
  CarSize,
  Cleaner,
  Customer,
  CustomerStatus,
  CycleMonth,
  ISODate,
  ISODateTime,
  Invoice,
  InvoiceStatus,
  JobStatus,
  PageQuery,
  Payment,
  PaymentMethod,
  RescheduleRequest,
  RescheduleStatus,
  Role,
  SchedulePattern,
  Vehicle,
  WashPackage,
  WashStatus,
} from './domain';

/* ------------------------------------------------------------------ Auth */

export type DemoPersona = 'CUSTOMER_APPROVED' | 'CUSTOMER_PENDING' | 'CLEANER' | 'ADMIN';

export interface DemoAccount {
  persona: DemoPersona;
  role: Role;
  label: string;
  phone: string;
  password: string;
}

/* ------------------------------------------------------------- Customers */

/** Cleaner as shown on a vehicle. Customer-facing responses always set this to null. */
export type CleanerRef = Pick<Cleaner, 'id' | 'name'>;

export interface VehicleDetail extends Vehicle {
  package: WashPackage | null;
  cleaner: CleanerRef | null;
}

export interface CustomerSummary {
  customer: Customer;
  vehicle: VehicleDetail | null;
}

export interface CustomerDetail {
  customer: Customer;
  vehicles: VehicleDetail[];
}

export interface CustomerQuery extends PageQuery {
  search?: string;
  status?: CustomerStatus | 'ALL';
  block?: string | 'ALL';
  cleanerId?: string | 'ALL' | 'UNASSIGNED';
}

/* -------------------------------------------------------------- Packages */

export interface PackageQuery extends PageQuery {
  includeInactive?: boolean;
  /** Only packages compatible with this size. */
  carSize?: CarSize;
}

/* -------------------------------------------------------------- Cleaners */

export interface CleanerWorkload {
  cleaner: Cleaner;
  assignedVehicles: number;
  /** Active vehicles per block — the cleaner's route coverage. */
  vehiclesByBlock: Record<string, number>;
  jobsToday: number;
  completedToday: number;
  notPresentToday: number;
}

/** One day of a cleaner's month, for the Targets screen. */
export interface CleanerDaySummary {
  date: ISODate;
  scheduled: number;
  completed: number;
  notPresent: number;
}

/** One day of the cleaner's 7-day schedule carousel. */
export interface WeekScheduleDay {
  date: ISODate;
  total: number;
  byBlock: Record<string, number>;
}

export interface AssignedCustomerQuery extends PageQuery {
  cleanerId: string;
  search?: string;
}

export interface AssignedCustomer {
  customerId: string;
  name: string;
  phone: string;
  block: string;
  flat: string;
  vehicles: Array<{ id: string; registration: string; makeModel: string; parkingSlot: string; schedulePattern: SchedulePattern | null }>;
}

export interface ReassignInput {
  fromCleanerId: string;
  toCleanerId: string;
  /** Limit the move to one block; ALL moves the cleaner's whole route. */
  block: string | 'ALL';
}

/* ---------------------------------------------------------------- Washes */

export interface CleanerJobQuery extends PageQuery {
  cleanerId: string;
  date: ISODate;
  status?: JobStatus | 'ALL';
  search?: string;
}

/** Counts for a cleaner's day — drives the sticky progress header and filter chips. */
export interface JobSummary {
  date: ISODate;
  total: number;
  pending: number;
  completed: number;
  vehicleNotPresent: number;
}

export interface WashSummaryQuery {
  from: ISODate;
  to: ISODate;
  cleanerId?: string;
  block?: string | 'ALL';
}

/** Aggregate over a date range — dashboards use this instead of raw rows. */
export interface WashSummary {
  from: ISODate;
  to: ISODate;
  scheduled: number;
  completed: number;
  vehicleNotPresent: number;
  pending: number;
  /** completed ÷ (scheduled jobs on past days + recorded today), 0–100. */
  completionRate: number;
}

export interface CompleteWashInput {
  jobId: string;
  /** Compressed after-wash photo. Mandatory — the service rejects completion without it. */
  photo: Blob;
}

export interface NotPresentInput {
  jobId: string;
  note: string;
}

export interface CustomerHistoryQuery extends PageQuery {
  vehicleId: string;
  /** Restrict to one month. */
  cycle?: CycleMonth;
  status?: WashStatus | 'ALL';
  /** Gallery view: only washes with an after-wash photo. */
  withPhotosOnly?: boolean;
}

export interface RollupQuery extends PageQuery {
  vehicleId: string;
}

export interface PhotoQuery extends PageQuery {
  from: ISODate;
  to: ISODate;
  block?: string | 'ALL';
  cleanerId?: string | 'ALL';
  search?: string;
}

/** Admin-only photo row: includes audit timestamp and cleaner metadata. */
export interface AdminPhotoEntry {
  photoId: string;
  date: ISODate;
  recordedAt: ISODateTime;
  registration: string;
  ownerName: string;
  block: string;
  flat: string;
  cleanerId: string;
  cleanerName: string;
}

/* ------------------------------------------------------------ Schedules */

export interface RescheduleView extends RescheduleRequest {
  ownerName: string;
  registration: string;
  block: string;
  flat: string;
}

export interface RescheduleQuery extends PageQuery {
  status: RescheduleStatus | 'ALL';
}

export interface CustomerRescheduleQuery extends PageQuery {
  customerId: string;
  vehicleId?: string;
}

/** One cell of the admin master calendar. */
export interface CalendarDay {
  date: ISODate;
  scheduled: number;
  completed: number;
  notPresent: number;
  rescheduled: number;
}

/* -------------------------------------------------------------- Payments */

export interface AccountSummary {
  outstanding: number;
  overdueCount: number;
  lastPayment: Payment | null;
}

export interface PayInvoiceInput {
  invoiceId: string;
  method: PaymentMethod;
  upiId?: string;
  /**
   * Phase 1 only: which result the simulated gateway returns. Real gateway
   * implementations ignore it.
   */
  mockOutcome?: 'SUCCESS' | 'FAILURE';
}

export interface CustomerInvoiceQuery extends PageQuery {
  customerId: string;
}

export interface CustomerPaymentQuery extends PageQuery {
  customerId: string;
}

export interface InvoiceQuery extends PageQuery {
  cycle?: CycleMonth;
  status?: InvoiceStatus | 'ALL';
  search?: string;
}

export interface InvoiceView extends Invoice {
  ownerName: string;
  block: string;
  flat: string;
  registration: string;
  lastTransactionAt: ISODateTime | null;
}

export interface InvoiceOverrideInput {
  invoiceId: string;
  status: Extract<InvoiceStatus, 'PAID' | 'DUE'>;
  note: string;
}

export interface CollectionsSummary {
  cycle: CycleMonth;
  billed: number;
  collected: number;
  outstanding: number;
  overdueInvoices: number;
}

/* ----------------------------------------------------------------- Admin */

export interface DailyTrendPoint {
  date: ISODate;
  scheduled: number;
  completed: number;
  notPresent: number;
}

export interface DashboardStats {
  date: ISODate;
  totalCustomers: number;
  activeVehicles: number;
  cleanersActive: number;
  pendingApprovals: number;
  openReschedules: number;
  jobsToday: number;
  completedToday: number;
  notPresentToday: number;
  pendingToday: number;
  /** Completed ÷ scheduled for the last 7 days before today, 0–100. */
  completionRate: number;
  outstandingInvoices: number;
  outstandingAmount: number;
}

export interface AuditQuery extends PageQuery {
  action?: AuditAction | 'ALL';
  entityType?: AuditEntityType | 'ALL';
  role?: Role | 'SYSTEM' | 'ALL';
  search?: string;
}

export interface AdminNotification {
  id: string;
  kind: 'APPROVAL' | 'RESCHEDULE' | 'OVERDUE';
  title: string;
  detail: string;
  href: string;
  at: ISODateTime;
}
