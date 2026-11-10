import { Compass, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/shared';

function StatusPage({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-navy-50 px-4 text-center">
      <Logo />
      <div className="mt-10 rounded-full bg-navy-100 p-4 text-navy-500">{icon}</div>
      <h1 className="mt-4 text-xl font-semibold text-navy-900">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-navy-500">{body}</p>
      <Link to="/" className="mt-6 font-semibold text-brand hover:underline">
        Go to my home screen
      </Link>
    </div>
  );
}

export const ForbiddenPage = () => (
  <StatusPage icon={<ShieldAlert className="h-7 w-7" aria-hidden />} title="You don’t have access" body="This area is for a different account type." />
);

export const NotFoundPage = () => (
  <StatusPage icon={<Compass className="h-7 w-7" aria-hidden />} title="Page not found" body="The page you were looking for doesn’t exist or has moved." />
);
