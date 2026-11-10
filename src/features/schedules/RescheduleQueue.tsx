import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { FormField } from '@/components/forms';
import { RescheduleStatusBadge } from '@/components/shared';
import { Alert, Button, Card, Modal, Pagination, SkeletonList, Tabs, Textarea } from '@/components/ui';
import { qk } from '@/hooks/queryKeys';
import { useToast } from '@/hooks/useToast';
import { useServices } from '@/services';
import type { RescheduleStatus, RescheduleView } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { formatDateShort, formatDateTime } from '@/utils/formatters';

/** Reschedule review queue. Approving creates a makeup job; it never adds wash progress by itself. */
export function RescheduleQueue() {
  const services = useServices();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<RescheduleStatus | 'ALL'>('REQUESTED');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<RescheduleView | null>(null);
  const [note, setNote] = useState('');
  const query = { status, page, limit: 15 };
  const list = useQuery({ queryKey: qk.schedules.list(query), queryFn: () => services.schedules.listReschedules(query), placeholderData: keepPreviousData });

  const resolve = useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED'; note: string | null }) => services.schedules.resolveReschedule(v.id, v.decision, v.note),
    onSuccess: async (_, v) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.schedules.all }), queryClient.invalidateQueries({ queryKey: qk.admin.all }), queryClient.invalidateQueries({ queryKey: qk.washes.all })]);
      toast.success(v.decision === 'APPROVED' ? 'Reschedule approved' : 'Reschedule rejected', v.decision === 'APPROVED' ? 'A makeup job is on the cleaner’s list for that day.' : undefined);
      setRejecting(null);
      setNote('');
    },
    onError: (e) => toast.error('Could not update request', getErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <Tabs
        label="Request status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          { value: 'REQUESTED', label: 'Pending', count: status === 'REQUESTED' ? list.data?.total : undefined },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'ALL', label: 'All' },
        ]}
      />
      <Card>
        {list.isPending ? (
          <div className="p-4">
            <SkeletonList rows={4} />
          </div>
        ) : list.isError ? (
          <ErrorState message={getErrorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Nothing in this queue" />
        ) : (
          <>
            <ul className="divide-y divide-navy-100">
              {list.data.items.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-navy-900">{r.ownerName}</p>
                      <span className="text-sm text-navy-500">
                        {r.block}-{r.flat}
                      </span>
                      <span className="font-mono text-xs font-bold text-navy-700">{r.registration}</span>
                    </div>
                    <p className="mt-1 text-sm text-navy-700">
                      Missed <span className="font-medium">{formatDateShort(r.missedDate)}</span> → requested <span className="font-semibold">{formatDateShort(r.requestedDate)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-navy-500">
                      “{r.reason}” · {formatDateTime(r.createdAt)}
                    </p>
                    {r.adminNote && <p className="mt-0.5 text-xs text-navy-500">Note: {r.adminNote}</p>}
                  </div>
                  {r.status === 'REQUESTED' ? (
                    <div className="flex gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        icon={<Check className="h-4 w-4" />}
                        loading={resolve.isPending && resolve.variables.id === r.id && resolve.variables.decision === 'APPROVED'}
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ id: r.id, decision: 'APPROVED', note: null })}
                      >
                        Approve
                      </Button>
                      <Button variant="secondary" size="sm" icon={<X className="h-4 w-4" />} disabled={resolve.isPending} onClick={() => setRejecting(r)}>
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <RescheduleStatusBadge status={r.status} />
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} pageSize={list.data.limit} total={list.data.total} busy={list.isFetching} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        busy={resolve.isPending}
        title="Reject reschedule"
        description="The resident will see your note."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={resolve.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={resolve.isPending} disabled={note.trim().length < 3} onClick={() => rejecting && resolve.mutate({ id: rejecting.id, decision: 'REJECTED', note })}>
              Reject
            </Button>
          </>
        }
      >
        {resolve.isError && <Alert tone="danger" className="mb-3">{getErrorMessage(resolve.error)}</Alert>}
        <FormField label="Note to resident" required>
          {(p) => <Textarea id={p.id} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. That day is fully booked — please pick another date." />}
        </FormField>
      </Modal>
    </div>
  );
}
