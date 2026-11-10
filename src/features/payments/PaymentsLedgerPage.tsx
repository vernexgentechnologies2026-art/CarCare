import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeIndianRupee, PenLine, Receipt, Search, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState } from '@/components/feedback';
import { FormField, SelectField } from '@/components/forms';
import { InvoiceStatusBadge, MockPaymentNotice } from '@/components/shared';
import { Alert, Button, Card, DataTable, Modal, PageHeader, Pagination, SearchInput, Skeleton, SkeletonList, StatTile, Tabs, Textarea, type Column } from '@/components/ui';
import { qk } from '@/hooks/queryKeys';
import { useDebounced } from '@/hooks/useDebounced';
import { useToast } from '@/hooks/useToast';
import { invoiceOverrideSchema, type InvoiceOverrideValues } from '@/schemas';
import { useServices } from '@/services';
import type { InvoiceQuery, InvoiceStatus, InvoiceView } from '@/types';
import { cycleOf, previousCycle } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { formatCycle, formatDate, formatDateTime, formatINR } from '@/utils/formatters';

/** Payments & invoicing ledger with status filters and a manual status override. */
export function PaymentsLedgerPage() {
  const services = useServices();
  const current = cycleOf(services.today());
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as InvoiceStatus | null) ?? 'ALL';
  const [cycle, setCycle] = useState(current);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [overriding, setOverriding] = useState<InvoiceView | null>(null);
  const debounced = useDebounced(search);

  const query: InvoiceQuery = { page, limit: 20, cycle, status, search: debounced };
  const summary = useQuery({ queryKey: qk.payments.collections(cycle), queryFn: () => services.payments.getCollectionsSummary(cycle) });
  const list = useQuery({ queryKey: qk.payments.adminInvoices(query), queryFn: () => services.payments.listAllInvoices(query), placeholderData: keepPreviousData });

  const columns: Column<InvoiceView>[] = [
    { key: 'no', header: 'Invoice', cell: (i) => <span className="whitespace-nowrap font-mono text-xs">{i.number}</span> },
    {
      key: 'owner',
      header: 'Resident',
      cell: (i) => (
        <div>
          <p className="font-medium text-navy-900">{i.ownerName}</p>
          <p className="text-xs text-navy-500">
            {i.block}-{i.flat} · <span className="font-mono">{i.registration}</span>
          </p>
        </div>
      ),
    },
    { key: 'due', header: 'Due', hideOnMobile: true, cell: (i) => formatDate(i.dueOn) },
    { key: 'tx', header: 'Last transaction', hideOnMobile: true, cell: (i) => (i.lastTransactionAt ? formatDateTime(i.lastTransactionAt) : <span className="text-navy-400">—</span>) },
    { key: 'amount', header: 'Amount', className: 'text-right', cell: (i) => <span className="tabular-nums">{formatINR(i.amount)}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => (
        <div>
          <InvoiceStatusBadge status={i.status} />
          {i.overrideNote && <p className="mt-0.5 max-w-[12rem] truncate text-[11px] text-navy-500" title={i.overrideNote}>Override: {i.overrideNote}</p>}
        </div>
      ),
    },
    {
      key: 'override',
      header: '',
      className: 'text-right',
      cell: (i) => (
        <Button size="sm" variant="ghost" icon={<PenLine className="h-4 w-4" />} onClick={() => setOverriding(i)} aria-label={`Override status of ${i.number}`}>
          Override
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments ledger"
        description="Invoices and (simulated) collections."
        actions={
          <Tabs
            label="Billing month"
            value={cycle}
            onChange={(c) => {
              setCycle(c);
              setPage(1);
            }}
            options={[
              { value: current, label: formatCycle(current) },
              { value: previousCycle(current), label: formatCycle(previousCycle(current)) },
            ]}
          />
        }
      />
      <MockPaymentNotice />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.data ? (
          <>
            <StatTile label="Billed" value={formatINR(summary.data.billed)} icon={<Receipt className="h-4 w-4" />} accent="neutral" />
            <StatTile label="Collected" value={formatINR(summary.data.collected)} sub={summary.data.billed ? `${Math.round((summary.data.collected / summary.data.billed) * 100)}% of billed` : undefined} icon={<Wallet className="h-4 w-4" />} accent="success" />
            <StatTile label="Outstanding" value={formatINR(summary.data.outstanding)} icon={<BadgeIndianRupee className="h-4 w-4" />} accent="warning" />
            <StatTile label="Overdue invoices" value={summary.data.overdueInvoices} icon={<AlertTriangle className="h-4 w-4" />} accent={summary.data.overdueInvoices ? 'danger' : 'neutral'} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-navy-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            label="Invoice status"
            value={status}
            onChange={(s) => {
              setParams(s === 'ALL' ? {} : { status: s }, { replace: true });
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'PAID', label: 'Paid' },
              { value: 'DUE', label: 'Outstanding' },
              { value: 'OVERDUE', label: 'Overdue' },
            ]}
          />
          <SearchInput
            icon={<Search className="h-4 w-4" />}
            placeholder="Invoice no., name, flat or vehicle"
            aria-label="Search invoices"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="lg:w-80"
          />
        </div>
        {list.isPending ? (
          <div className="p-4">
            <SkeletonList rows={6} />
          </div>
        ) : list.isError ? (
          <ErrorState message={getErrorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="No invoices match" />
        ) : (
          <>
            <DataTable caption="Invoices" columns={columns} rows={list.data.items} rowKey={(i) => i.id} dimmed={list.isPlaceholderData} />
            <Pagination page={list.data.page} pageSize={list.data.limit} total={list.data.total} busy={list.isFetching} onPageChange={setPage} />
          </>
        )}
      </Card>
      {overriding && <OverrideDialog invoice={overriding} onClose={() => setOverriding(null)} />}
    </div>
  );
}

function OverrideDialog({ invoice, onClose }: { invoice: InvoiceView; onClose: () => void }) {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvoiceOverrideValues>({ resolver: zodResolver(invoiceOverrideSchema), defaultValues: { status: invoice.status === 'PAID' ? 'DUE' : 'PAID', note: '' } });
  const mutation = useMutation({
    mutationFn: (v: InvoiceOverrideValues) => services.payments.overrideInvoiceStatus({ invoiceId: invoice.id, ...v }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.payments.all }), queryClient.invalidateQueries({ queryKey: qk.admin.all })]);
      toast.success('Invoice status updated', invoice.number);
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      busy={mutation.isPending}
      title="Manual status override"
      description={`${invoice.number} · ${invoice.ownerName} · ${formatINR(invoice.amount)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="override-form" loading={mutation.isPending}>
            Save override
          </Button>
        </>
      }
    >
      <form id="override-form" noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        {mutation.isError && <Alert tone="danger">{getErrorMessage(mutation.error)}</Alert>}
        <SelectField
          label="New status"
          required
          options={[
            { value: 'PAID', label: 'Paid (e.g. cash received at the office)' },
            { value: 'DUE', label: 'Outstanding (reverse a payment)' },
          ]}
          {...register('status')}
        />
        <FormField label="Reason" required error={errors.note?.message} hint="Saved on the invoice and in the activity log.">
          {(p) => <Textarea id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} placeholder="e.g. Cash received at office, receipt #214" {...register('note')} />}
        </FormField>
      </form>
    </Modal>
  );
}
