import type {
  AuditAction,
  AuditEntityType,
  CustomerStatus,
  DemoPersona,
  InvoiceStatus,
  JobStatus,
  PaymentMethod,
  RescheduleStatus,
  Role,
} from '@/types';

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  CLEANER: 'Cleaner',
  CUSTOMER: 'Resident',
};

export const PERSONA_LABEL: Record<DemoPersona, string> = {
  CUSTOMER_APPROVED: 'Customer (Approved)',
  CUSTOMER_PENDING: 'Customer (Pending Approval)',
  CLEANER: 'Cleaner',
  ADMIN: 'Admin',
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  VEHICLE_NOT_PRESENT: 'Vehicle not present',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
  RESCHEDULED: 'Rescheduled',
};

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  PENDING_APPROVAL: 'Pending approval',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  PAUSED: 'Paused',
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PAID: 'Paid',
  DUE: 'Outstanding',
  OVERDUE: 'Overdue',
};

export const RESCHEDULE_STATUS_LABEL: Record<RescheduleStatus, string> = {
  REQUESTED: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  UPI: 'UPI',
  CARD: 'Debit / Credit card',
  NET_BANKING: 'Net banking',
  CASH: 'Cash (recorded by office)',
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  SIGNED_IN: 'Signed in',
  REGISTRATION_SUBMITTED: 'Registration submitted',
  REGISTRATION_APPROVED: 'Registration approved',
  REGISTRATION_REJECTED: 'Registration rejected',
  CUSTOMER_PAUSED: 'Service paused',
  CUSTOMER_RESUMED: 'Service resumed',
  CLEANER_ASSIGNED: 'Cleaner assigned',
  CLEANER_REASSIGNED: 'Route reassigned',
  PACKAGE_CHANGED: 'Package changed',
  PACKAGE_SELECTED: 'Package selected',
  PACKAGE_CREATED: 'Package created',
  PACKAGE_UPDATED: 'Package updated',
  WASH_COMPLETED: 'Wash completed',
  VEHICLE_NOT_PRESENT: 'Vehicle not present',
  RESCHEDULE_REQUESTED: 'Reschedule requested',
  RESCHEDULE_APPROVED: 'Reschedule approved',
  RESCHEDULE_REJECTED: 'Reschedule rejected',
  PAYMENT_SUCCEEDED: 'Payment succeeded (mock)',
  PAYMENT_FAILED: 'Payment failed (mock)',
  INVOICE_OVERRIDDEN: 'Invoice status overridden',
};

export const AUDIT_ENTITY_LABEL: Record<AuditEntityType, string> = {
  SESSION: 'Session',
  CUSTOMER: 'Customer',
  VEHICLE: 'Vehicle',
  CLEANER: 'Cleaner',
  PACKAGE: 'Package',
  WASH: 'Wash',
  RESCHEDULE: 'Reschedule',
  PAYMENT: 'Payment',
  INVOICE: 'Invoice',
};
