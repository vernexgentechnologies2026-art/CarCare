import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { FormField } from '@/components/forms';
import { Alert, Button, Modal, Textarea } from '@/components/ui';
import { useMarkNotPresent } from '@/hooks/useJobs';
import type { CleanerJob } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { NOTE_MAX_LENGTH } from '@/utils/washCompletionRules';

/**
 * Rule 2 — Vehicle Not Present: a distinct outcome that ends the job for the
 * day, writes an audit record for manager review, and never counts as a wash.
 */
export function VehicleNotPresentDialog({ job, open, onClose, onRecorded }: { job: CleanerJob; open: boolean; onClose: () => void; onRecorded: (job: CleanerJob) => void }) {
  const [note, setNote] = useState('');
  const mutation = useMarkNotPresent(job.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      title="Mark vehicle not present?"
      description={`${job.vehicle.registration} · Slot ${job.vehicle.parkingSlot}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="warning" size="lg" loading={mutation.isPending} onClick={() => mutation.mutate(note, { onSuccess: onRecorded })}>
            Confirm not present
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone="warning" icon={<ShieldAlert className="h-4 w-4" />} title="This does not count as a wash">
          The job closes for today and is logged for manager audit. The resident can request a makeup wash.
        </Alert>
        {mutation.isError && <Alert tone="danger">{getErrorMessage(mutation.error)}</Alert>}
        <FormField label="Note for the office (optional)" hint={`e.g. Slot empty at 6:30 AM · ${note.length}/${NOTE_MAX_LENGTH}`}>
          {(p) => <Textarea id={p.id} aria-describedby={p.describedBy} maxLength={NOTE_MAX_LENGTH} value={note} onChange={(e) => setNote(e.target.value)} />}
        </FormField>
      </div>
    </Modal>
  );
}
