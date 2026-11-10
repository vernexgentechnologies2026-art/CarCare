import { ArrowLeft, CarFront, Clock, Info, MapPin, Phone, Upload } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/feedback';
import { JobStatusBadge, SecurePhoto } from '@/components/shared';
import { Alert, Card, CardHeader, DescriptionList, SkeletonList } from '@/components/ui';
import { CAR_SIZE_LABEL, SCHEDULE_LABEL } from '@/constants';
import { useJob } from '@/hooks/useJobs';
import { useToast } from '@/hooks/useToast';
import { useServices } from '@/services';
import type { CleanerJob } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { formatDateShort, formatDateTime, formatPhone } from '@/utils/formatters';
import { canRecord } from '@/utils/washCompletionRules';
import { VehicleNotPresentDialog } from './VehicleNotPresentDialog';

/** Back to the list (keeping its filters), or to /cleaner/today on deep links. */
export function useBackToJobs() {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key === 'default') navigate('/cleaner/today', { replace: true });
    else navigate(-1);
  };
}

/** `/cleaner/jobs/:id` — and `/cleaner/jobs/:id/vnp`, which opens the VNP dialog over it. */
export function JobDetailPage() {
  const { jobId = '' } = useParams();
  const services = useServices();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useBackToJobs();
  const job = useJob(jobId);
  const vnpOpen = location.pathname.endsWith('/vnp');

  return (
    <div className="space-y-4">
      <button type="button" onClick={goBack} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-navy-600 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to jobs
      </button>
      {job.isPending ? (
        <SkeletonList rows={3} />
      ) : job.isError ? (
        <ErrorState message={getErrorMessage(job.error)} onRetry={() => void job.refetch()} />
      ) : (
        <>
          <JobSummary job={job.data} />
          {job.data.record ? (
            <RecordedOutcome job={job.data} />
          ) : canRecord(job.data, services.today()) ? (
            <div className="sticky bottom-16 z-10 space-y-2 rounded-xl bg-white p-3 shadow-lg ring-1 ring-navy-200 sm:bottom-4">
              <Link
                to={`/cleaner/jobs/${jobId}/complete`}
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-success px-4 text-base font-semibold text-white hover:bg-success-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2"
              >
                <Upload className="h-5 w-5" aria-hidden /> Complete Wash &amp; Upload Photo
              </Link>
              <Link
                to={`/cleaner/jobs/${jobId}/vnp`}
                replace
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold text-navy-800 ring-1 ring-inset ring-navy-200 hover:bg-navy-50"
              >
                <CarFront className="h-5 w-5" aria-hidden /> Vehicle Not Present
              </Link>
            </div>
          ) : (
            <Alert tone="neutral">Outcomes can only be recorded on the scheduled day.</Alert>
          )}
          {!job.data.record && (
            <VehicleNotPresentDialog
              job={job.data}
              open={vnpOpen}
              onClose={() => navigate(`/cleaner/jobs/${jobId}`, { replace: true })}
              onRecorded={(updated) => {
                toast.success('Marked as not present', `${updated.vehicle.registration} — logged for manager review`);
                navigate('/cleaner/today', { replace: true });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function JobSummary({ job }: { job: CleanerJob }) {
  return (
    <>
      <Card className="overflow-hidden">
        <SecurePhoto photoId={job.vehiclePhotoId} alt={`Reference photo of ${job.vehicle.registration}`} className="aspect-[16/9] w-full" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xl font-bold tracking-tight text-navy-900">{job.vehicle.registration}</p>
              <p className="text-sm text-navy-600">
                {job.vehicle.makeModel} · {job.vehicle.color} · {CAR_SIZE_LABEL[job.vehicle.carSize]}
              </p>
            </div>
            <JobStatusBadge status={job.status} />
          </div>
          {job.vehicle.timeRestriction && (
            <Alert tone="warning" icon={<Clock className="h-4 w-4" />} title="Time restriction" className="mt-3">
              {job.vehicle.timeRestriction}
            </Alert>
          )}
          {job.vehicle.instructions && (
            <Alert tone="brand" icon={<Info className="h-4 w-4" />} title="Resident’s instructions" className="mt-3">
              {job.vehicle.instructions}
            </Alert>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Location & resident" />
        <div className="px-4">
          <DescriptionList
            items={[
              {
                label: 'Parking slot',
                value: (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {job.vehicle.parkingSlot}
                  </span>
                ),
              },
              { label: 'Block / Flat', value: `${job.owner.block} – ${job.owner.flat}` },
              { label: 'Owner', value: job.owner.name },
              {
                label: 'Phone',
                value: (
                  <a href={`tel:+91${job.owner.phone}`} className="inline-flex min-h-[44px] items-center gap-1 text-brand hover:underline">
                    <Phone className="h-4 w-4" aria-hidden />
                    {formatPhone(job.owner.phone)}
                  </a>
                ),
              },
              { label: 'Address', value: <span className="block max-w-[14rem]">{job.owner.address}</span> },
              { label: 'Schedule', value: `${SCHEDULE_LABEL[job.schedulePattern]}${job.isReschedule ? ' · makeup wash' : ''}` },
              { label: 'Date', value: formatDateShort(job.date) },
            ]}
          />
        </div>
      </Card>
    </>
  );
}

function RecordedOutcome({ job }: { job: CleanerJob }) {
  const r = job.record;
  if (!r) return null;
  return (
    <Card>
      <CardHeader title="Recorded" description={formatDateTime(r.recordedAt)} action={<JobStatusBadge status={r.status} />} />
      <div className="p-4">
        {r.photoId && <SecurePhoto photoId={r.photoId} alt="After-wash photo" className="aspect-[4/3] w-full rounded-lg" />}
        {r.note && <p className="text-sm text-navy-700">Note: {r.note}</p>}
      </div>
    </Card>
  );
}
