import { CalendarDays } from 'lucide-react';
import { SecurePhoto } from '@/components/shared';
import type { CustomerWashEntry } from '@/types';
import { formatDate } from '@/utils/formatters';

/**
 * Responsive after-wash photo cards. Rule 7: each card shows the wash DATE
 * only — no time, cleaner name or cleaner id.
 */
export function PhotoGrid({ entries, onOpen }: { entries: CustomerWashEntry[]; onOpen: (entry: CustomerWashEntry) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {entries.map((e) =>
        e.photoId ? (
          <li key={e.date}>
            <button
              type="button"
              onClick={() => onOpen(e)}
              className="group block w-full overflow-hidden rounded-xl bg-white text-left shadow-card ring-1 ring-navy-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={`Open photo from ${formatDate(e.date)}`}
            >
              <SecurePhoto photoId={e.photoId} alt="" className="aspect-[4/3] w-full transition-transform group-hover:scale-[1.02]" />
              <span className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-navy-900">
                <CalendarDays className="h-4 w-4 text-navy-400" aria-hidden />
                {formatDate(e.date)}
              </span>
            </button>
          </li>
        ) : null,
      )}
    </ul>
  );
}
