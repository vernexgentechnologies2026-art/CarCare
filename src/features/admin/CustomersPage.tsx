import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState } from '@/components/feedback';
import { CustomerStatusBadge } from '@/components/shared';
import { Button, Card, DataTable, PageHeader, Pagination, SearchInput, Select, SkeletonList, Tabs, type Column } from '@/components/ui';
import { BLOCKS, CAR_SIZE_LABEL, CUSTOMER_STATUS_LABEL, SCHEDULE_LABEL } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useCleaners } from '@/hooks/useCleaners';
import { useDebounced } from '@/hooks/useDebounced';
import { useServices } from '@/services';
import type { CustomerQuery, CustomerStatus, CustomerSummary } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { formatDateTime, formatPhone } from '@/utils/formatters';
import { ApproveDialog, RejectDialog } from './ApprovalDialogs';
import { CustomerDrawer } from './CustomerDrawer';

type Tab = 'all' | 'pending';

/** Customer & registration review: All Residents / Pending Approvals, with an inspection drawer. */
export function CustomersPage() {
  const services = useServices();
  const cleaners = useCleaners();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'pending' ? 'pending' : 'all';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CustomerStatus | 'ALL'>('ALL');
  const [block, setBlock] = useState('ALL');
  const [cleanerId, setCleanerId] = useState('ALL');
  const [inspect, setInspect] = useState<string | null>(null);
  const [approving, setApproving] = useState<CustomerSummary | null>(null);
  const [rejecting, setRejecting] = useState<CustomerSummary | null>(null);
  const debounced = useDebounced(search);

  const counts = useQuery({ queryKey: qk.customers.counts, queryFn: () => services.customers.countByStatus() });
  const query: CustomerQuery = {
    page,
    limit: 20,
    search: debounced,
    status: tab === 'pending' ? 'PENDING_APPROVAL' : status,
    block,
    cleanerId: tab === 'pending' ? 'ALL' : cleanerId,
  };
  const list = useQuery({ queryKey: qk.customers.list(query), queryFn: () => services.customers.list(query), placeholderData: keepPreviousData });
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<CustomerSummary>[] = [
    {
      key: 'name',
      header: 'Resident',
      cell: (r) => (
        <div>
          <p className="font-medium text-navy-900">{r.customer.name}</p>
          <p className="text-xs text-navy-500">{formatPhone(r.customer.phone)}</p>
        </div>
      ),
    },
    { key: 'flat', header: 'Flat', cell: (r) => <span className="whitespace-nowrap">{r.customer.block}-{r.customer.flat}</span> },
    {
      key: 'reg',
      header: 'Vehicle',
      cell: (r) =>
        r.vehicle ? (
          <div>
            <p className="whitespace-nowrap font-mono text-xs font-bold">{r.vehicle.registration}</p>
            <p className="text-xs text-navy-500">{CAR_SIZE_LABEL[r.vehicle.carSize]}</p>
          </div>
        ) : (
          '—'
        ),
    },
    ...(tab === 'pending'
      ? [
          { key: 'submitted', header: 'Submitted', hideOnMobile: true, cell: (r: CustomerSummary) => formatDateTime(r.customer.createdAt) },
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            cell: (r: CustomerSummary) => (
              <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} onClick={() => setApproving(r)}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => setRejecting(r)}>
                  Reject
                </Button>
              </div>
            ),
          },
        ]
      : [
          { key: 'pkg', header: 'Schedule', hideOnMobile: true, cell: (r: CustomerSummary) => (r.vehicle?.package ? SCHEDULE_LABEL[r.vehicle.package.schedulePattern] : <span className="text-navy-400">No package</span>) },
          { key: 'cleaner', header: 'Cleaner', hideOnMobile: true, cell: (r: CustomerSummary) => r.vehicle?.cleaner?.name ?? <span className="text-warning-700">Unassigned</span> },
          { key: 'status', header: 'Status', cell: (r: CustomerSummary) => <CustomerStatusBadge status={r.customer.status} /> },
        ]),
  ];

  return (
    <div>
      <PageHeader title="Customers" description="Residents, registrations and their vehicles." />
      <Tabs
        label="Customer view"
        className="mb-4"
        value={tab}
        onChange={(v) => {
          setParams(v === 'pending' ? { tab: 'pending' } : {}, { replace: true });
          setPage(1);
        }}
        options={[
          { value: 'all', label: 'All Residents' },
          { value: 'pending', label: 'Pending Approvals', count: counts.data?.PENDING_APPROVAL },
        ]}
      />
      <Card>
        <div className="grid gap-3 border-b border-navy-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput icon={<Search className="h-4 w-4" />} placeholder="Name, phone, flat or registration" aria-label="Search customers" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} className="sm:col-span-2 lg:col-span-1" />
          {tab === 'all' && (
            <Select aria-label="Status" value={status} onChange={(e) => resetPage(setStatus)(e.target.value as CustomerStatus | 'ALL')}>
              <option value="ALL">All statuses</option>
              {(Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CUSTOMER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label="Block" value={block} onChange={(e) => resetPage(setBlock)(e.target.value)}>
            <option value="ALL">All blocks</option>
            {BLOCKS.map((b) => (
              <option key={b} value={b}>
                Block {b}
              </option>
            ))}
          </Select>
          {tab === 'all' && (
            <Select aria-label="Cleaner" value={cleanerId} onChange={(e) => resetPage(setCleanerId)(e.target.value)}>
              <option value="ALL">All cleaners</option>
              <option value="UNASSIGNED">Unassigned</option>
              {(cleaners.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        {list.isPending ? (
          <div className="p-4">
            <SkeletonList rows={6} />
          </div>
        ) : list.isError ? (
          <ErrorState message={getErrorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title={tab === 'pending' ? 'All caught up' : 'No matching customers'} description={tab === 'pending' ? 'No registrations are waiting for approval.' : 'Try clearing a filter.'} />
        ) : (
          <>
            <DataTable caption="Customers" columns={columns} rows={list.data.items} rowKey={(r) => r.customer.id} onRowClick={(r) => setInspect(r.customer.id)} dimmed={list.isPlaceholderData} />
            <Pagination page={list.data.page} pageSize={list.data.limit} total={list.data.total} busy={list.isFetching} onPageChange={setPage} />
          </>
        )}
      </Card>

      <CustomerDrawer customerId={inspect} onClose={() => setInspect(null)} onApprove={setApproving} onReject={setRejecting} />
      {approving && <ApproveDialog row={approving} onClose={() => setApproving(null)} />}
      {rejecting && <RejectDialog row={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}
