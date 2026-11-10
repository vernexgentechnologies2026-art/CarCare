import { Card, Skeleton } from '@/components/ui';
import type { AccountSummary } from '@/types';
import { formatDate, formatINR } from '@/utils/formatters';

export function BalanceCard({ summary, loading }: { summary: AccountSummary | undefined; loading: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="bg-navy-900 p-5 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Outstanding balance</p>
        {loading ? <Skeleton className="mt-2 h-9 w-32 bg-navy-800" /> : <p className="mt-1 text-3xl font-semibold tabular-nums">{formatINR(summary?.outstanding ?? 0)}</p>}
        {summary && (
          <p className="mt-1 text-sm text-navy-300">
            {summary.outstanding === 0
              ? 'You’re all paid up.'
              : summary.overdueCount > 0
                ? `${summary.overdueCount} overdue invoice${summary.overdueCount > 1 ? 's' : ''}`
                : 'Due by the 10th of the month'}
          </p>
        )}
      </div>
      {summary?.lastPayment && (
        <p className="px-5 py-3 text-xs text-navy-500">
          Last payment {formatINR(summary.lastPayment.amount)} on {formatDate(summary.lastPayment.createdAt.slice(0, 10))}
        </p>
      )}
    </Card>
  );
}
