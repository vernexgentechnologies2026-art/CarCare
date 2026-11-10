import { CheckCircle2, CircleDashed, Clock, XCircle, AlertTriangle, CarFront, PauseCircle } from 'lucide-react';
import {
  CUSTOMER_STATUS_LABEL,
  INVOICE_STATUS_LABEL,
  JOB_STATUS_LABEL,
  RESCHEDULE_STATUS_LABEL,
} from '@/constants';
import type { CustomerStatus, InvoiceStatus, JobStatus, PaymentStatus, RescheduleStatus } from '@/types';
import { Badge } from '../ui/Badge';

const ic = 'h-3.5 w-3.5';

/** Status is always icon + label + colour — never colour alone. */
export function JobStatusBadge({ status }: { status: JobStatus }) {
  if (status === 'COMPLETED') return <Badge tone="success" icon={<CheckCircle2 className={ic} aria-hidden />}>{JOB_STATUS_LABEL[status]}</Badge>;
  if (status === 'VEHICLE_NOT_PRESENT') return <Badge tone="warning" icon={<CarFront className={ic} aria-hidden />}>{JOB_STATUS_LABEL[status]}</Badge>;
  if (status === 'RESCHEDULED') return <Badge tone="brand" icon={<Clock className={ic} aria-hidden />}>{JOB_STATUS_LABEL[status]}</Badge>;
  if (status === 'CANCELLED' || status === 'FAILED') return <Badge tone="danger" icon={<XCircle className={ic} aria-hidden />}>{JOB_STATUS_LABEL[status]}</Badge>;
  return <Badge tone="neutral" icon={<CircleDashed className={ic} aria-hidden />}>{JOB_STATUS_LABEL[status]}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === 'PAID') return <Badge tone="success" icon={<CheckCircle2 className={ic} aria-hidden />}>{INVOICE_STATUS_LABEL[status]}</Badge>;
  if (status === 'OVERDUE') return <Badge tone="danger" icon={<AlertTriangle className={ic} aria-hidden />}>{INVOICE_STATUS_LABEL[status]}</Badge>;
  return <Badge tone="warning" icon={<Clock className={ic} aria-hidden />}>{INVOICE_STATUS_LABEL[status]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return status === 'SUCCESS' ? (
    <Badge tone="success" icon={<CheckCircle2 className={ic} aria-hidden />}>Successful</Badge>
  ) : (
    <Badge tone="danger" icon={<XCircle className={ic} aria-hidden />}>Failed</Badge>
  );
}

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const map = {
    ACTIVE: { tone: 'success', icon: <CheckCircle2 className={ic} aria-hidden /> },
    PENDING_APPROVAL: { tone: 'warning', icon: <Clock className={ic} aria-hidden /> },
    REJECTED: { tone: 'danger', icon: <XCircle className={ic} aria-hidden /> },
    PAUSED: { tone: 'neutral', icon: <PauseCircle className={ic} aria-hidden /> },
  } as const;
  const m = map[status];
  return <Badge tone={m.tone} icon={m.icon}>{CUSTOMER_STATUS_LABEL[status]}</Badge>;
}

export function RescheduleStatusBadge({ status }: { status: RescheduleStatus }) {
  if (status === 'APPROVED') return <Badge tone="success" icon={<CheckCircle2 className={ic} aria-hidden />}>{RESCHEDULE_STATUS_LABEL[status]}</Badge>;
  if (status === 'REJECTED') return <Badge tone="danger" icon={<XCircle className={ic} aria-hidden />}>{RESCHEDULE_STATUS_LABEL[status]}</Badge>;
  return <Badge tone="warning" icon={<Clock className={ic} aria-hidden />}>{RESCHEDULE_STATUS_LABEL[status]}</Badge>;
}
