import { CarFront, CircleSlash } from 'lucide-react';
import type { ReactNode } from 'react';
import { JobStatusBadge, SecurePhoto } from '@/components/shared';
import type { CustomerWashEntry } from '@/types';
import { formatDate, formatDateShort } from '@/utils/formatters';

/**
 * Customer-facing wash history. Dates only — entries carry no times or
 * cleaner identity by contract (`CustomerWashEntry`).
 */
export function WashHistoryList({
  entries,
  onOpenPhoto,
  renderAction,
}: {
  entries: CustomerWashEntry[];
  onOpenPhoto?: (entry: CustomerWashEntry) => void;
  renderAction?: (entry: CustomerWashEntry) => ReactNode;
}) {
  return (
    <ul className="divide-y divide-navy-100">
      {entries.map((entry) => (
        <li key={entry.date} className="flex items-center gap-3 px-4 py-3">
          {entry.photoId && onOpenPhoto ? (
            <button
              type="button"
              onClick={() => onOpenPhoto(entry)}
              className="shrink-0 overflow-hidden rounded-lg ring-1 ring-navy-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={`View photo from ${formatDate(entry.date)}`}
            >
              <SecurePhoto photoId={entry.photoId} alt="" className="h-12 w-16" />
            </button>
          ) : (
            <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-500" aria-hidden>
              {entry.status === 'VEHICLE_NOT_PRESENT' ? <CarFront className="h-5 w-5" /> : <CircleSlash className="h-5 w-5" />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy-900">{formatDateShort(entry.date)}</p>
            <div className="mt-1">
              <JobStatusBadge status={entry.status} />
            </div>
          </div>
          {renderAction?.(entry)}
        </li>
      ))}
    </ul>
  );
}
