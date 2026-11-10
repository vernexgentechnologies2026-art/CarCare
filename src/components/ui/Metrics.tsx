import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** KPI tile. Value text uses ink tokens; an optional icon carries the accent. */
export function StatTile({
  label,
  value,
  sub,
  icon,
  accent = 'brand',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const accentCls = {
    brand: 'bg-brand-50 text-brand',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
    neutral: 'bg-navy-100 text-navy-600',
  }[accent];
  return (
    <div className="rounded-xl bg-white p-4 shadow-card ring-1 ring-navy-200/70">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-navy-500">{label}</p>
        {icon && <span className={cn('rounded-lg p-1.5', accentCls)}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-navy-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-navy-500">{sub}</p>}
    </div>
  );
}

/** Linear meter with a track; label and value stay in ink, the fill carries status. */
export function Meter({ value, max, tone = 'success', label }: { value: number; max: number; tone?: 'success' | 'brand' | 'warning'; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill = { success: 'bg-success', brand: 'bg-brand', warning: 'bg-warning' }[tone];
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 w-full overflow-hidden rounded-full bg-navy-100">
      <div className={cn('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
