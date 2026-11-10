/**
 * CarCare domain model.
 *
 * These types are the contract shared by the UI and every service implementation
 * (mock in Phase 1, Supabase/R2 from Phase 5). They intentionally contain no
 * persistence details. Enum values are UPPER_SNAKE; a Phase 5 adapter maps them
 * to lower_snake database values (`COMPLETED` ↔ `completed`).
 */

/** Calendar date in local time, formatted `YYYY-MM-DD`. */
export type ISODate = string;
/** Full ISO-8601 timestamp. Never exposed through customer-facing DTOs. */
export type ISODateTime = string;
/** Billing / wash cycle month, formatted `YYYY-MM`. */
export type CycleMonth = string;

export type Role = 'ADMIN' | 'CLEANER' | 'CUSTOMER';

export type CarSize = 'HATCHBACK' | 'SEDAN' | 'COMPACT_SUV' | 'LARGE_SUV';

/** The four contracted schedules. No other pattern is valid. */
export type SchedulePattern = 'DAILY' | 'MON_WED_FRI' | 'TUE_FRI' | 'THU_ONLY';

export type CustomerStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'PAUSED';

/**
 * Every state a wash/job can be in. Only `COMPLETED` (photo-verified) counts
 * toward the 13-wash milestone — see `utils/washProgressCalculator`.
 */
export type WashStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VEHICLE_NOT_PRESENT' | 'CANCELLED' | 'FAILED' | 'RESCHEDULED';

/** Outcomes a cleaner can record for a job. */
export type WashOutcome = Extract<WashStatus, 'COMPLETED' | 'VEHICLE_NOT_PRESENT'>;

/** Status of a job on a cleaner's list. */
export type JobStatus = WashStatus;

export type RescheduleStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED';

export type InvoiceStatus = 'PAID' | 'DUE' | 'OVERDUE';

export type PaymentStatus = 'SUCCESS' | 'FAILED';

export type PaymentMethod = 'UPI' | 'CARD' | 'NET_BANKING' | 'CASH';

export interface Session {
  userId: string;
  role: Role;
  displayName: string;
  phone: string;
  /** Present when role is CUSTOMER. */
  customerId: string | null;
  /** Present when role is CLEANER. */
  cleanerId: string | null;
  /** Residents only: approval state, which gates access to the app. */
  customerStatus: CustomerStatus | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  block: string;
  flat: string;
  address: string;
  status: CustomerStatus;
  createdAt: ISODateTime;
  rejectionReason: string | null;
}

export interface Vehicle {
  id: string;
  customerId: string;
  /** Indian registration format, e.g. `TN-09-AB-1234`. */
  registration: string;
  carSize: CarSize;
  makeModel: string;
  color: string;
  /** Null until the resident chooses a package; unscheduled until then. */
  packageId: string | null;
  cleanerId: string | null;
  parkingSlot: string;
  /** Access restriction shown to cleaners, e.g. "Leaves by 7:30 AM". */
  timeRestriction: string | null;
  /** Resident's instructions to the cleaner. */
  instructions: string | null;
}

export interface WashPackage {
  id: string;
  name: string;
  /** Car sizes this package can be bought for (compatibility toggles). */
  carSizes: CarSize[];
  schedulePattern: SchedulePattern;
  /** Monthly price in whole rupees. Phase 1 values are fictional placeholders. */
  monthlyPrice: number;
  description: string;
  features: string[];
  active: boolean;
}

export interface Cleaner {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  assignedBlocks: string[];
}

export interface WashRecord {
  id: string;
  /** The job this record resolves — see `CleanerJob.id`. */
  jobId: string;
  vehicleId: string;
  cleanerId: string;
  scheduledDate: ISODate;
  status: WashOutcome;
  recordedAt: ISODateTime;
  /** Required when status is COMPLETED. */
  photoId: string | null;
  note: string | null;
}

/** A single item on a cleaner's daily list. */
export interface CleanerJob {
  /** Stable id: `${vehicleId}_${date}`, suffixed `_R` for an approved reschedule. */
  id: string;
  date: ISODate;
  status: JobStatus;
  isReschedule: boolean;
  vehicle: Pick<Vehicle, 'id' | 'registration' | 'carSize' | 'makeModel' | 'color' | 'parkingSlot' | 'timeRestriction' | 'instructions'>;
  /** Reference photo of the car (not an after-wash photo). */
  vehiclePhotoId: string;
  owner: Pick<Customer, 'id' | 'name' | 'phone' | 'block' | 'flat' | 'address'>;
  packageName: string;
  schedulePattern: SchedulePattern;
  record: WashRecord | null;
}

/**
 * Customer-facing wash entry. Deliberately carries a date only — no cleaning
 * time, cleaner name or cleaner id ever reaches a customer.
 */
export interface CustomerWashEntry {
  date: ISODate;
  status: WashStatus;
  photoId: string | null;
}

export interface WashProgress {
  cycle: CycleMonth;
  target: number;
  completed: number;
  vehicleNotPresent: number;
  remaining: number;
  /** 0–100, rounded. */
  percent: number;
}

/** Archived month of wash history, kept as a summary instead of per-wash rows. */
export interface MonthlyWashRollup {
  vehicleId: string;
  cycle: CycleMonth;
  completed: number;
  vehicleNotPresent: number;
  photosArchived: number;
}

export interface RescheduleRequest {
  id: string;
  customerId: string;
  vehicleId: string;
  missedDate: ISODate;
  requestedDate: ISODate;
  reason: string;
  status: RescheduleStatus;
  createdAt: ISODateTime;
  resolvedAt: ISODateTime | null;
  adminNote: string | null;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  vehicleId: string;
  cycle: CycleMonth;
  issuedOn: ISODate;
  dueOn: ISODate;
  /** Whole rupees. */
  amount: number;
  amountPaid: number;
  status: InvoiceStatus;
  /** Set when an admin overrides the status manually. */
  overrideNote: string | null;
}

export interface Payment {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Gateway reference. Phase 1 references are prefixed `MOCK-`. */
  reference: string;
  createdAt: ISODateTime;
  failureReason: string | null;
  /** True for every Phase 1 transaction. */
  simulated: boolean;
}

/** Time-limited access link to a privately stored photo. */
export interface SignedPhotoUrl {
  url: string;
  expiresAt: ISODateTime;
}

export type AuditAction =
  | 'SIGNED_IN'
  | 'REGISTRATION_SUBMITTED'
  | 'REGISTRATION_APPROVED'
  | 'REGISTRATION_REJECTED'
  | 'CUSTOMER_PAUSED'
  | 'CUSTOMER_RESUMED'
  | 'CLEANER_ASSIGNED'
  | 'CLEANER_REASSIGNED'
  | 'PACKAGE_CHANGED'
  | 'PACKAGE_SELECTED'
  | 'PACKAGE_CREATED'
  | 'PACKAGE_UPDATED'
  | 'WASH_COMPLETED'
  | 'VEHICLE_NOT_PRESENT'
  | 'RESCHEDULE_REQUESTED'
  | 'RESCHEDULE_APPROVED'
  | 'RESCHEDULE_REJECTED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'INVOICE_OVERRIDDEN';

export type AuditEntityType = 'SESSION' | 'CUSTOMER' | 'VEHICLE' | 'CLEANER' | 'PACKAGE' | 'WASH' | 'RESCHEDULE' | 'PAYMENT' | 'INVOICE';

/** Immutable record of a state-changing action, for the admin audit trail. */
export interface AuditEntry {
  id: string;
  at: ISODateTime;
  actorId: string;
  actorName: string;
  actorRole: Role | 'SYSTEM';
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
}

/** Every list query is paginated (capacity budget: no unbounded reads). */
export interface PageQuery {
  /** 1-based. */
  page: number;
  /** Rows per page; services clamp to 100. */
  limit: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
