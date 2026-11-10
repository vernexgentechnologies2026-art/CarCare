import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide below the `md` breakpoint. */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
  dimmed,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  caption: string;
  dimmed?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('min-w-full text-sm transition-opacity', dimmed && 'opacity-60')}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-navy-100 bg-navy-50/70 text-left text-xs font-medium uppercase tracking-wide text-navy-500">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-2.5', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row)) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(onRowClick && 'cursor-pointer hover:bg-navy-50 focus-visible:bg-brand-50 focus-visible:outline-none')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-middle text-navy-800', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  busy,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  busy?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-navy-100 px-4 py-3 text-sm">
      <p className="text-navy-500">
        <span className="font-medium tabular-nums text-navy-800">{from.toLocaleString('en-IN')}</span>–
        <span className="font-medium tabular-nums text-navy-800">{to.toLocaleString('en-IN')}</span> of{' '}
        <span className="font-medium tabular-nums text-navy-800">{total.toLocaleString('en-IN')}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" aria-label="Previous page" disabled={page <= 1 || busy} onClick={() => onPageChange(page - 1)} icon={<ChevronLeft className="h-4 w-4" />} />
        <span className="px-2 tabular-nums text-navy-600">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" aria-label="Next page" disabled={page >= pages || busy} onClick={() => onPageChange(page + 1)} icon={<ChevronRight className="h-4 w-4" />} />
      </div>
    </nav>
  );
}
