import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button, Card, CardHeader, PageHeader, Skeleton, SkeletonList } from '@/components/ui';
import { PhotoGrid } from '@/features/washes/PhotoGrid';
import { PhotoLightbox } from '@/features/washes/PhotoLightbox';
import { RollupList } from '@/features/washes/RollupList';
import { qk } from '@/hooks/queryKeys';
import { useServices } from '@/services';
import type { CustomerWashEntry } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/formatters';
import { useMyAccount, useSelectedVehicle } from './useMyAccount';
import { VehicleSwitcher } from './VehicleSwitcher';

const PAGE = 12;

/** After-wash photo gallery (date only on every card) + archived monthly rollups. */
export function PhotoGalleryPage() {
  const services = useServices();
  const account = useMyAccount();
  const { vehicle, select } = useSelectedVehicle(account.data?.vehicles);
  const vehicleId = vehicle?.id ?? '';
  const [open, setOpen] = useState<CustomerWashEntry | null>(null);

  const base = { vehicleId, withPhotosOnly: true, limit: PAGE };
  const photos = useInfiniteQuery({
    queryKey: qk.washes.history({ ...base, page: 0 }),
    queryFn: ({ pageParam }) => services.washes.getCustomerHistory({ ...base, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: Boolean(vehicleId),
  });
  const rollupQuery = { vehicleId, page: 1, limit: 6 };
  const rollups = useQuery({ queryKey: qk.washes.rollups(rollupQuery), queryFn: () => services.washes.getMonthlyRollups(rollupQuery), enabled: Boolean(vehicleId) });
  const entries = photos.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Wash photos" description="An after-wash photo for every completed wash, kept for 60 days." />
      {account.data && <VehicleSwitcher vehicles={account.data.vehicles} selectedId={vehicle?.id} onSelect={select} />}

      {photos.isPending ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3]" />
          ))}
        </div>
      ) : photos.isError ? (
        <ErrorState message={getErrorMessage(photos.error)} onRetry={() => void photos.refetch()} />
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState icon={<Camera className="h-6 w-6" />} title="No photos yet" description="Photos appear here after each completed wash." />
        </Card>
      ) : (
        <>
          <PhotoGrid entries={entries} onOpen={setOpen} />
          {photos.hasNextPage && (
            <Button block size="lg" variant="secondary" loading={photos.isFetchingNextPage} onClick={() => void photos.fetchNextPage()}>
              Load more photos
            </Button>
          )}
        </>
      )}

      <Card>
        <CardHeader title="Earlier months" description="Monthly summaries — photos older than 60 days are archived." />
        {rollups.isPending ? (
          <div className="p-4">
            <SkeletonList rows={2} />
          </div>
        ) : rollups.data && rollups.data.items.length > 0 ? (
          <RollupList rollups={rollups.data.items} />
        ) : (
          <p className="px-4 py-6 text-center text-sm text-navy-500">No archived months yet.</p>
        )}
      </Card>

      <PhotoLightbox
        photoId={open?.photoId ?? null}
        title="After-wash photo"
        description={open ? formatDate(open.date) : undefined}
        alt={open ? `After-wash photo from ${formatDate(open.date)}` : ''}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
