import { Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { Spinner } from '../shared/components/Spinner';

export function RouteContainer({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteSpinnerFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function RouteSpinnerFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <Spinner size={32} />
    </div>
  );
}
