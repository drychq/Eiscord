import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../shared/state/use-auth-store';

export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();

  if (status === 'authenticated') {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
