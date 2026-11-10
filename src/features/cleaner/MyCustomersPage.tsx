import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MapPin, Phone, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Card, PageHeader, Pagination, SearchInput, SkeletonList } from '@/components/ui';
import { SCHEDULE_LABEL } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useSession } from '@/hooks/useAuth';
import { useDebounced } from '@/hooks/useDebounced';
import { useServices } from '@/services';
import { formatPhone } from '@/utils/formatters';
import { getErrorMessage } from '@/utils/errors';

/** Searchable list of the residents assigned to this cleaner. */
export function MyCustomersPage() {
  const session = useSession();
  const services = useServices();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const query = { cleanerId: session.cleanerId ?? '', search: debounced, page, limit: 20 };
  const list = useQuery({ queryKey: qk.cleaners.customers(query), queryFn: () => services.cleaners.listAssignedCustomers(query), placeholderData: keepPreviousData });

  return (
    <div className="space-y-4">
      <PageHeader title="My customers" description={list.data ? `${list.data.total} residents on your route` : undefined} />
      <SearchInput
        icon={<Search className="h-4 w-4" />}
        placeholder="Name, flat or registration"
        aria-label="Search customers"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="[&_input]:h-11"
      />
      {list.isPending ? (
        <SkeletonList rows={5} />
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Users className="h-6 w-6" />} title="No residents found" />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-navy-100">
            {list.data.items.map((c) => (
              <li key={c.customerId} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0 rounded-lg bg-navy-900 px-2 py-1 text-xs font-semibold text-white">
                  {c.block}-{c.flat}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy-900">{c.name}</p>
                  {c.vehicles.map((v) => (
                    <p key={v.id} className="text-xs text-navy-600">
                      <span className="font-mono font-bold text-navy-800">{v.registration}</span> · {v.makeModel}
                      <span className="ml-1 inline-flex items-center gap-0.5 text-navy-500">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {v.parkingSlot}
                      </span>
                      {v.schedulePattern && <span className="text-navy-500"> · {SCHEDULE_LABEL[v.schedulePattern]}</span>}
                    </p>
                  ))}
                </div>
                <a href={`tel:+91${c.phone}`} aria-label={`Call ${c.name}, ${formatPhone(c.phone)}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-brand ring-1 ring-navy-200 hover:bg-brand-50">
                  <Phone className="h-5 w-5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <Pagination page={list.data.page} pageSize={list.data.limit} total={list.data.total} onPageChange={setPage} busy={list.isFetching} />
        </Card>
      )}
    </div>
  );
}
