import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../shared/state/use-auth-store';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();
  const location = useLocation();

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
