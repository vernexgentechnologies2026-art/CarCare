import { Archive } from 'lucide-react';
import { Meter } from '@/components/ui';
import { WASH_TARGET_PER_CYCLE } from '@/constants';
import type { MonthlyWashRollup } from '@/types';
import { formatCycle } from '@/utils/formatters';

/**
 * Archived months, shown as monthly summaries rather than per-wash rows
 * (photos past the retention window are no longer stored).
 */
export function RollupList({ rollups }: { rollups: MonthlyWashRollup[] }) {
  return (
    <ul className="divide-y divide-navy-100">
      {rollups.map((r) => (
        <li key={r.cycle} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-900">
              <Archive className="h-4 w-4 text-navy-400" aria-hidden />
              {formatCycle(r.cycle)}
            </p>
            <p className="text-sm tabular-nums text-navy-700">
              <span className="font-semibold text-navy-900">{r.completed}</span> / {WASH_TARGET_PER_CYCLE} washes
            </p>
          </div>
          <div className="mt-2">
            <Meter value={r.completed} max={WASH_TARGET_PER_CYCLE} label={`${formatCycle(r.cycle)} completed washes`} />
          </div>
          <p className="mt-1 text-xs text-navy-500">
            {r.vehicleNotPresent} vehicle not present · photos archived
          </p>
        </li>
      ))}
    </ul>
  );
}
