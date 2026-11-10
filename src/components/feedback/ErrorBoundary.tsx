import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button } from '../ui/Button';

function CrashScreen({ detail, onReset }: { detail: string | null; onReset: () => void }) {
  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-full bg-danger-50 p-4 text-danger">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-navy-900">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-navy-500">Please reload the page. If this keeps happening, contact the facility office.</p>
      {import.meta.env.DEV && detail && <pre className="mt-4 max-w-lg overflow-x-auto rounded bg-navy-100 p-3 text-left text-xs text-navy-700">{detail}</pre>}
      <Button className="mt-6" onClick={onReset}>
        Reload
      </Button>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this value clears the error (e.g. pass the current pathname). */
  resetKey?: unknown;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: unknown;
}

/**
 * Catches render errors in a subtree so one broken widget never blanks the
 * whole app. Phase 5 forwards `componentDidCatch` to the error tracker.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('ErrorBoundary caught', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return this.props.fallback ? this.props.fallback(error, this.reset) : <CrashScreen detail={error.message} onReset={() => window.location.reload()} />;
  }
}

/** Router-level fallback (`errorElement`) for loader, lazy-import and render failures. */
export function RouteErrorPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : null;
  return (
    <div className="bg-navy-50">
      <CrashScreen detail={detail} onReset={() => window.location.assign('/')} />
    </div>
  );
}
