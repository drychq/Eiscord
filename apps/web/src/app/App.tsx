import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createQueryClient } from '../shared/api/query-client';
import { Toaster } from '../shared/components/Toaster';
import { AuthInitializer } from './AuthInitializer';
import { AppRouter } from './router';

export function App() {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        <AppRouter />
      </AuthInitializer>
      <Toaster />
    </QueryClientProvider>
  );
}
