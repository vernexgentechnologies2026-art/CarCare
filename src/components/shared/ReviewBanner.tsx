import { FlaskConical } from 'lucide-react';
import { useServices } from '@/services';

/** Thin banner shown only on the mock data source. */
export function ReviewBanner() {
  const services = useServices();
  if (services.dataSource !== 'mock') return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-warning-50 px-4 py-1.5 text-center text-xs text-warning-700 ring-1 ring-warning-100">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Phase 1 review build · sample data · payments and uploads are simulated</span>
    </div>
  );
}

/** Rule 9: every payment surface states that transactions are simulated. */
export function MockPaymentNotice({ compact = false }: { compact?: boolean }) {
  const services = useServices();
  if (services.dataSource !== 'mock') return null;
  if (compact) return <p className="text-xs text-warning-700">Simulated (Phase 1 mock) — no real money moved.</p>;
  return (
    <div role="note" className="flex items-start gap-2 rounded-lg bg-warning-50 p-3 text-xs text-warning-700 ring-1 ring-inset ring-warning-100">
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Simulated payments (Phase 1 mock).</strong> No real gateway is connected and no money moves. Results are for UI review only.
      </span>
    </div>
  );
}
