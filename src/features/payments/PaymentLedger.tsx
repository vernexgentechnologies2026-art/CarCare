import { EmptyState } from '@/components/feedback';
import { PaymentStatusBadge } from '@/components/shared';
import { PAYMENT_METHOD_LABEL } from '@/constants';
import type { Payment } from '@/types';
import { formatDateTime, formatINR } from '@/utils/formatters';

/** A resident's payment attempts, successful and failed, newest first. */
export function PaymentLedger({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) return <EmptyState title="No payments yet" />;
  return (
    <ul className="divide-y divide-navy-100">
      {payments.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-navy-900">
              {PAYMENT_METHOD_LABEL[p.method]}
              {p.simulated && <span className="rounded bg-warning-50 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-warning-700 ring-1 ring-inset ring-warning-100">Mock</span>}
            </p>
            <p className="text-xs text-navy-500">
              {formatDateTime(p.createdAt)} · <span className="font-mono">{p.reference}</span>
            </p>
            {p.failureReason && <p className="text-xs text-danger-700">{p.failureReason}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-navy-900">{formatINR(p.amount)}</p>
            <PaymentStatusBadge status={p.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
