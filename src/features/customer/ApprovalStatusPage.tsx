import { ArrowRight, Clock, LogOut, MapPin, Phone, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo, ReviewBanner } from '@/components/shared';
import { Alert, Button, Card, CardHeader, DescriptionList, Skeleton } from '@/components/ui';
import { CAR_SIZE_LABEL } from '@/constants';
import { homeFor, isApprovedResident } from '@/features/auth/permissions';
import { useAuth, useSession } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { formatDateTime } from '@/utils/formatters';
import { useMyAccount } from './useMyAccount';

/** Holding screen for residents whose registration is under review (or was rejected). */
export function ApprovalStatusPage() {
  const session = useSession();
  const { refresh, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const account = useMyAccount();
  const [checking, setChecking] = useState(false);
  const rejected = session.customerStatus === 'REJECTED';
  const approved = isApprovedResident(session);

  const check = async () => {
    setChecking(true);
    try {
      const next = await refresh();
      await account.refetch();
      if (next && isApprovedResident(next)) {
        toast.success('Registration approved', 'Welcome to CarCare — choose your wash package next.');
        navigate(homeFor(next), { replace: true });
      } else {
        toast.info('Still under review', 'We’ll update this page as soon as the office approves you.');
      }
    } finally {
      setChecking(false);
    }
  };

  const vehicle = account.data?.vehicles[0];

  return (
    <div className="min-h-dvh bg-navy-50">
      <ReviewBanner />
      <div className="mx-auto max-w-md space-y-4 px-4 pb-28 pt-8">
        <div className="flex items-center justify-between">
          <Logo />
          <Button
            variant="ghost"
            size="lg"
            icon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </Button>
        </div>

        {approved ? (
          <Alert tone="success" title="Registration approved">
            You’re all set.{' '}
            <button type="button" className="font-semibold underline" onClick={() => navigate(homeFor(session), { replace: true })}>
              Go to your dashboard
            </button>
          </Alert>
        ) : rejected ? (
          <div role="status" className="rounded-xl bg-danger-50 p-5 ring-1 ring-inset ring-danger-100">
            <XCircle className="h-8 w-8 text-danger" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold text-navy-900">Registration not approved</h1>
            <p className="mt-1 text-sm text-navy-700">{account.data?.customer.rejectionReason ?? 'Please contact the facility office for details.'}</p>
          </div>
        ) : (
          <div role="status" className="rounded-xl bg-warning-50 p-5 ring-1 ring-inset ring-warning-100">
            <Clock className="h-8 w-8 text-warning-700" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold text-navy-900">Registration Under Review</h1>
            <p className="mt-1 text-sm text-navy-700">
              The facility office is verifying your flat and vehicle. This usually takes up to 2 working days. You can choose your wash package as soon as you’re approved.
            </p>
            <Button className="mt-4" size="lg" variant="secondary" loading={checking} icon={<RefreshCw className="h-4 w-4" />} onClick={() => void check()}>
              Check status
            </Button>
          </div>
        )}

        <Card>
          <CardHeader title="Your registration" />
          <div className="px-4">
            {account.isPending ? (
              <Skeleton className="my-4 h-32" />
            ) : account.data ? (
              <DescriptionList
                items={[
                  { label: 'Owner', value: account.data.customer.name },
                  { label: 'Flat', value: `Block ${account.data.customer.block}, ${account.data.customer.flat}` },
                  { label: 'Vehicle', value: vehicle ? <span className="font-mono">{vehicle.registration}</span> : '—' },
                  { label: 'Car size', value: vehicle ? CAR_SIZE_LABEL[vehicle.carSize] : '—' },
                  { label: 'Parking slot', value: vehicle?.parkingSlot ?? '—' },
                  { label: 'Submitted', value: formatDateTime(account.data.customer.createdAt) },
                ]}
              />
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-navy-900">Need help?</p>
          <ul className="mt-2 space-y-2 text-sm text-navy-700">
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-navy-400" aria-hidden /> Facility office, Block A ground floor
            </li>
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-navy-400" aria-hidden /> Mon–Sat, 9:00 AM – 6:00 PM
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-navy-400" aria-hidden /> Use the intercom: dial 100 for the office
            </li>
          </ul>
          {approved && (
            <Button className="mt-4" block size="lg" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(homeFor(session))}>
              Continue
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
