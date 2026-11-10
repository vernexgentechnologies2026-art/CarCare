import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/feedback';
import { ImageUploadZone } from '@/components/forms';
import { Alert, Button, Card, CardHeader, SkeletonList } from '@/components/ui';
import { useCompleteWash, useJob } from '@/hooks/useJobs';
import { useToast } from '@/hooks/useToast';
import { useServices } from '@/services';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';
import type { CompressedPhoto } from '@/utils/photoCompressor';
import { canRecord, validateWashCompletion } from '@/utils/washCompletionRules';

/**
 * `/cleaner/jobs/:id/complete` — rule 3: select → compress → preview → attach.
 * "Confirm Wash Completed" stays disabled until a valid photo is attached;
 * the service re-checks regardless.
 */
export function WashCompletionPage() {
  const { jobId = '' } = useParams();
  const services = useServices();
  const navigate = useNavigate();
  const toast = useToast();
  const job = useJob(jobId);
  const complete = useCompleteWash(jobId);
  const [photo, setPhoto] = useState<CompressedPhoto | null>(null);
  const ready = validateWashCompletion({ photo: photo?.blob });

  const back = (
    <Link to={`/cleaner/jobs/${jobId}`} replace className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-900">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to job
    </Link>
  );

  if (job.isPending) return <SkeletonList rows={3} />;
  if (job.isError) return <ErrorState message={getErrorMessage(job.error)} onRetry={() => void job.refetch()} />;
  if (!canRecord(job.data, services.today())) {
    return (
      <div className="space-y-4">
        {back}
        <Alert tone="neutral">This job can’t be recorded now — it’s already recorded or not scheduled for today.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {back}
      <Card>
        <CardHeader title={<span className="font-mono font-bold">{job.data.vehicle.registration}</span>} description={`Slot ${job.data.vehicle.parkingSlot} · ${job.data.owner.block}-${job.data.owner.flat}`} />
        <div className="space-y-4 p-4">
          <ol className="space-y-1 text-sm" aria-label="Completion checklist">
            <Step done={photo !== null}>Photo taken and compressed</Step>
            <Step done={ready}>Photo attached</Step>
            <Step done={false}>Confirm wash completed</Step>
          </ol>
          {complete.isError && <Alert tone="danger">{getErrorMessage(complete.error)}</Alert>}
          <ImageUploadZone
            value={photo}
            onChange={(p) => {
              setPhoto(p);
              complete.reset();
            }}
            disabled={complete.isPending}
          />
          <Button
            variant="success"
            size="lg"
            block
            className="min-h-[52px] text-base"
            disabled={!ready || complete.isPending}
            loading={complete.isPending}
            icon={<CheckCircle2 className="h-5 w-5" />}
            onClick={() =>
              photo &&
              complete.mutate(photo.blob, {
                onSuccess: (updated) => {
                  toast.success('Wash completed', updated.vehicle.registration);
                  navigate('/cleaner/today', { replace: true });
                },
              })
            }
          >
            Confirm Wash Completed
          </Button>
          {!ready && <p className="text-center text-xs text-navy-500">Attach an after-wash photo to enable this button.</p>}
        </div>
      </Card>
    </div>
  );
}

function Step({ done, children }: { done: boolean; children: string }) {
  return (
    <li className={cn('flex items-center gap-2', done ? 'text-success-700' : 'text-navy-500')}>
      {done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Circle className="h-4 w-4" aria-hidden />}
      <span>
        {children}
        <span className="sr-only">{done ? ' — done' : ' — not yet'}</span>
      </span>
    </li>
  );
}
