import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createQueryClient } from '../shared/api/query-client';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { Toaster } from '../shared/components/Toaster';
import { useTheme } from '../shared/hooks/use-theme';
import { AuthInitializer } from './AuthInitializer';
import { AppRouter } from './router';

export function App() {
  const [queryClient] = useState(() => createQueryClient());
  useTheme();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthInitializer>
          <AppRouter />
        </AuthInitializer>
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
