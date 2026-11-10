import { useState } from 'react';
import type { DailyTrendPoint } from '@/types';
import { cn } from '@/utils/cn';
import { formatDateShort } from '@/utils/formatters';
import { parseISODate } from '@/utils/dates';

/**
 * Stacked daily bars: completed / not present / not recorded.
 * Status colours carry state (with legend + tooltip + table view, never colour alone).
 */
const SERIES = [
  { key: 'completed', label: 'Completed', swatch: 'bg-success' },
  { key: 'notPresent', label: 'Vehicle not present', swatch: 'bg-warning' },
  { key: 'open', label: 'Not recorded', swatch: 'bg-navy-300' },
] as const;

export function TrendChart({ points }: { points: DailyTrendPoint[] }) {
  const [showTable, setShowTable] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...points.map((p) => p.scheduled));
  const rows = points.map((p) => ({ ...p, open: Math.max(0, p.scheduled - p.completed - p.notPresent) }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-600" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-sm', s.swatch)} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setShowTable((v) => !v)} className="text-xs font-semibold text-brand hover:underline" aria-pressed={showTable}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Daily wash outcomes</caption>
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs uppercase tracking-wide text-navy-500">
                <th scope="col" className="py-2 pr-4">Date</th>
                <th scope="col" className="py-2 pr-4 text-right">Scheduled</th>
                <th scope="col" className="py-2 pr-4 text-right">Completed</th>
                <th scope="col" className="py-2 pr-4 text-right">Not present</th>
                <th scope="col" className="py-2 text-right">Not recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100 tabular-nums">
              {rows.map((r) => (
                <tr key={r.date}>
                  <td className="py-1.5 pr-4 text-navy-800">{formatDateShort(r.date)}</td>
                  <td className="py-1.5 pr-4 text-right">{r.scheduled}</td>
                  <td className="py-1.5 pr-4 text-right">{r.completed}</td>
                  <td className="py-1.5 pr-4 text-right">{r.notPresent}</td>
                  <td className="py-1.5 text-right">{r.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-4">
          {/* recessive gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48" aria-hidden>
            {[0, 0.5, 1].map((f) => (
              <div key={f} className="absolute inset-x-0 border-t border-dashed border-navy-100" style={{ top: `${(1 - f) * 100}%` }}>
                <span className="absolute -top-2 left-0 bg-white pr-1 text-[10px] tabular-nums text-navy-400">{Math.round(max * f)}</span>
              </div>
            ))}
          </div>
          <div className="flex h-48 items-end gap-1 pl-7 sm:gap-2" role="img" aria-label="Daily wash outcomes for the last 14 days. Use “Show table” for exact values.">
            {rows.map((r) => {
              const weekday = parseISODate(r.date).toLocaleDateString('en-IN', { weekday: 'narrow' });
              const isActive = active === r.date;
              return (
                <div
                  key={r.date}
                  className="group relative flex h-full flex-1 flex-col justify-end"
                  onMouseEnter={() => setActive(r.date)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(r.date)}
                  onBlur={() => setActive(null)}
                  tabIndex={0}
                  aria-label={`${formatDateShort(r.date)}: ${r.completed} completed, ${r.notPresent} not present, ${r.open} not recorded`}
                >
                  <div className="flex flex-col-reverse gap-[2px]" style={{ height: `${(r.scheduled / max) * 100}%` }}>
                    {SERIES.map((s, i) => {
                      const value = r[s.key];
                      if (value === 0) return null;
                      const isTop = SERIES.slice(i + 1).every((n) => r[n.key] === 0);
                      return (
                        <div
                          key={s.key}
                          className={cn(s.swatch, isTop && 'rounded-t', isActive && 'opacity-90')}
                          style={{ flexGrow: value, flexBasis: 0, minHeight: 2 }}
                        />
                      );
                    })}
                  </div>
                  <span className="mt-1 text-center text-[10px] text-navy-400" aria-hidden>
                    {weekday}
                  </span>
                  {isActive && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-44 -translate-x-1/2 rounded-lg bg-navy-900 p-2.5 text-xs text-white shadow-lg">
                      <p className="font-semibold">{formatDateShort(r.date)}</p>
                      <p className="mt-1 text-navy-300">{r.scheduled} scheduled</p>
                      {SERIES.map((s) => (
                        <p key={s.key} className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-sm', s.swatch)} aria-hidden />
                            {s.label}
                          </span>
                          <span className="tabular-nums">{r[s.key]}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
