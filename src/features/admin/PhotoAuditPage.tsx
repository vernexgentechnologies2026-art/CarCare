import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Camera, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { FormField } from '@/components/forms';
import { SecurePhoto } from '@/components/shared';
import { Card, DescriptionList, Input, PageHeader, Pagination, SearchInput, Select, Skeleton } from '@/components/ui';
import { BLOCKS, PHOTO_RETENTION_DAYS } from '@/constants';
import { PhotoLightbox } from '@/features/washes/PhotoLightbox';
import { qk } from '@/hooks/queryKeys';
import { useCleaners } from '@/hooks/useCleaners';
import { useDebounced } from '@/hooks/useDebounced';
import { useServices } from '@/services';
import type { AdminPhotoEntry, PhotoQuery } from '@/types';
import { cn } from '@/utils/cn';
import { addDays } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatDate, formatDateTime } from '@/utils/formatters';

/** Central photo inspection: filter by date, block, cleaner and customer; full audit timestamps (admin only). */
export function PhotoAuditPage() {
  const services = useServices();
  const today = services.today();
  const retentionStart = addDays(today, -PHOTO_RETENTION_DAYS);
  const cleaners = useCleaners();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [block, setBlock] = useState('ALL');
  const [cleanerId, setCleanerId] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AdminPhotoEntry | null>(null);
  const debounced = useDebounced(search);

  const query: PhotoQuery = { page, limit: 24, from, to, block, cleanerId, search: debounced };
  const list = useQuery({ queryKey: qk.washes.photos(query), queryFn: () => services.washes.listPhotos(query), placeholderData: keepPreviousData });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Photo audit" description="Every after-wash photo, with recording time and cleaner." />
      <p className="-mt-3 mb-5 inline-flex items-center gap-1.5 text-xs text-navy-500">
        <ShieldCheck className="h-3.5 w-3.5 text-success-700" aria-hidden />
        Private storage, short-lived links, kept {PHOTO_RETENTION_DAYS} days (since {formatDate(retentionStart)}).
      </p>
      <Card>
        <div className="grid gap-3 border-b border-navy-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <FormField label="From">{(p) => <Input id={p.id} type="date" min={retentionStart} max={to} value={from} onChange={(e) => reset(setFrom)(e.target.value || retentionStart)} />}</FormField>
          <FormField label="To">{(p) => <Input id={p.id} type="date" min={from} max={today} value={to} onChange={(e) => reset(setTo)(e.target.value || today)} />}</FormField>
          <FormField label="Block">
            {(p) => (
              <Select id={p.id} value={block} onChange={(e) => reset(setBlock)(e.target.value)}>
                <option value="ALL">All blocks</option>
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    Block {b}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Cleaner">
            {(p) => (
              <Select id={p.id} value={cleanerId} onChange={(e) => reset(setCleanerId)(e.target.value)}>
                <option value="ALL">All cleaners</option>
                {(cleaners.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Customer">{(p) => <SearchInput id={p.id} icon={<Search className="h-4 w-4" />} placeholder="Name, flat or vehicle" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />}</FormField>
        </div>
        {list.isPending ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3]" />
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState message={getErrorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<Camera className="h-6 w-6" />} title="No photos for these filters" />
        ) : (
          <>
            <ul className={cn('grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6', list.isPlaceholderData && 'opacity-60')}>
              {list.data.items.map((p) => (
                <li key={p.photoId}>
                  <button type="button" onClick={() => setOpen(p)} className="group block w-full overflow-hidden rounded-lg text-left ring-1 ring-navy-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    <SecurePhoto photoId={p.photoId} alt={`${p.registration} on ${formatDate(p.date)}`} className="aspect-[4/3] w-full transition-transform group-hover:scale-[1.02]" />
                    <span className="block px-2 py-1.5">
                      <span className="block truncate font-mono text-xs font-bold text-navy-900">{p.registration}</span>
                      <span className="block truncate text-[11px] text-navy-500">
                        {p.block}-{p.flat} · {formatDateTime(p.recordedAt)}
                      </span>
                      <span className="block truncate text-[11px] text-navy-500">by {p.cleanerName}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} pageSize={list.data.limit} total={list.data.total} busy={list.isFetching} onPageChange={setPage} />
          </>
        )}
      </Card>

      <PhotoLightbox photoId={open?.photoId ?? null} title={open?.registration ?? ''} description={open ? `${open.ownerName} · ${open.block}-${open.flat}` : undefined} alt={open ? `${open.registration} after wash` : ''} onClose={() => setOpen(null)}>
        {open && (
          <div className="mt-3">
            <DescriptionList
              items={[
                { label: 'Wash date', value: formatDate(open.date) },
                { label: 'Recorded at', value: formatDateTime(open.recordedAt) },
                { label: 'Cleaner', value: `${open.cleanerName} (${open.cleanerId})` },
                { label: 'Photo id', value: <span className="font-mono text-xs">{open.photoId}</span> },
              ]}
            />
          </div>
        )}
      </PhotoLightbox>
    </div>
  );
}
