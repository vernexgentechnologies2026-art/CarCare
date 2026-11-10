import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Badge, Card, DataTable, PageHeader, Pagination, SearchInput, Select, SkeletonList, Tabs, type Column, type Tone } from '@/components/ui';
import { AUDIT_ACTION_LABEL, AUDIT_ENTITY_LABEL, ROLE_LABEL } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { useDebounced } from '@/hooks/useDebounced';
import { useServices } from '@/services';
import type { AuditAction, AuditEntityType, AuditEntry, AuditQuery, Role } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { formatDateTime } from '@/utils/formatters';

const ACTION_TONE: Partial<Record<AuditAction, Tone>> = {
  REGISTRATION_APPROVED: 'success',
  WASH_COMPLETED: 'success',
  PAYMENT_SUCCEEDED: 'success',
  RESCHEDULE_APPROVED: 'success',
  REGISTRATION_REJECTED: 'danger',
  PAYMENT_FAILED: 'danger',
  RESCHEDULE_REJECTED: 'danger',
  VEHICLE_NOT_PRESENT: 'warning',
  CUSTOMER_PAUSED: 'warning',
  PACKAGE_UPDATED: 'brand',
  PACKAGE_CREATED: 'brand',
  PACKAGE_CHANGED: 'brand',
  CLEANER_ASSIGNED: 'brand',
};

const COLUMNS: Column<AuditEntry>[] = [
  { key: 'at', header: 'When', className: 'whitespace-nowrap', cell: (e) => <span className="text-navy-600">{formatDateTime(e.at)}</span> },
  {
    key: 'actor',
    header: 'Who',
    cell: (e) => (
      <div>
        <p className="font-medium text-navy-900">{e.actorName}</p>
        <p className="text-xs text-navy-500">{e.actorRole === 'SYSTEM' ? 'System' : ROLE_LABEL[e.actorRole]}</p>
      </div>
    ),
  },
  { key: 'action', header: 'Action', cell: (e) => <Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{AUDIT_ACTION_LABEL[e.action]}</Badge> },
  { key: 'summary', header: 'Details', cell: (e) => <span className="text-navy-700">{e.summary}</span> },
  { key: 'entity', header: 'Record', hideOnMobile: true, cell: (e) => <span className="whitespace-nowrap text-xs text-navy-500">{AUDIT_ENTITY_LABEL[e.entityType]} · <span className="font-mono">{e.entityId}</span></span> },
];

/** Who did what, when — approvals, allocations, pricing, wash outcomes and payments. */
export function AuditLogPage() {
  const services = useServices();
  const [role, setRole] = useState<Role | 'SYSTEM' | 'ALL'>('ALL');
  const [action, setAction] = useState<AuditAction | 'ALL'>('ALL');
  const [entityType, setEntityType] = useState<AuditEntityType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const query: AuditQuery = { page, limit: 25, role, action, entityType, search: debounced };
  const log = useQuery({ queryKey: qk.admin.audit(query), queryFn: () => services.admin.listAuditLog(query), placeholderData: keepPreviousData });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Activity log" description="An append-only record of every change made in CarCare." />
      <p className="-mt-3 mb-5 inline-flex items-center gap-1.5 text-xs text-navy-500">
        <ShieldCheck className="h-3.5 w-3.5 text-success-700" aria-hidden />
        Entries are written by the system and can’t be edited or deleted.
      </p>
      <Card>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <Tabs
            label="Role"
            value={role}
            onChange={reset(setRole)}
            options={[
              { value: 'ALL', label: 'Everyone' },
              { value: 'ADMIN', label: 'Admins' },
              { value: 'CLEANER', label: 'Cleaners' },
              { value: 'CUSTOMER', label: 'Residents' },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-3 xl:w-[44rem]">
            <Select aria-label="Action" value={action} onChange={(e) => reset(setAction)(e.target.value as AuditAction | 'ALL')}>
              <option value="ALL">All actions</option>
              {(Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]).map((a) => (
                <option key={a} value={a}>
                  {AUDIT_ACTION_LABEL[a]}
                </option>
              ))}
            </Select>
            <Select aria-label="Record type" value={entityType} onChange={(e) => reset(setEntityType)(e.target.value as AuditEntityType | 'ALL')}>
              <option value="ALL">All records</option>
              {(Object.keys(AUDIT_ENTITY_LABEL) as AuditEntityType[]).map((t) => (
                <option key={t} value={t}>
                  {AUDIT_ENTITY_LABEL[t]}
                </option>
              ))}
            </Select>
            <SearchInput icon={<Search className="h-4 w-4" />} placeholder="Name, vehicle or detail" aria-label="Search activity" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          </div>
        </div>
        {log.isPending ? (
          <div className="p-4">
            <SkeletonList rows={6} />
          </div>
        ) : log.isError ? (
          <ErrorState message={getErrorMessage(log.error)} onRetry={() => void log.refetch()} />
        ) : log.data.items.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No activity matches" description="Try widening the filters." />
        ) : (
          <>
            <DataTable caption="Activity log" columns={COLUMNS} rows={log.data.items} rowKey={(e) => e.id} dimmed={log.isPlaceholderData} />
            <Pagination page={log.data.page} pageSize={log.data.limit} total={log.data.total} busy={log.isFetching} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
