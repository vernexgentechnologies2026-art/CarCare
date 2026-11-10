import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />,
  error: <XCircle className="h-5 w-5 text-danger" aria-hidden />,
  info: <Info className="h-5 w-5 text-brand" aria-hidden />,
};

export function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-navy-200"
    >
      {ICON[toast.tone]}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-navy-900">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm text-navy-600">{toast.description}</p>}
      </div>
      <button type="button" onClick={() => onDismiss(toast.id)} className="rounded p-0.5 text-navy-400 hover:text-navy-700" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Fixed stack of toasts, top-centre on mobile and top-right on desktop. */
export function ToastViewport({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
