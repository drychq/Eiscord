import { useQuery } from '@tanstack/react-query';
import { request } from '../api/http-client';
import { userSummarySchema, type UserSummary } from '@eiscord/shared';
import { useAuthStore } from '../state/use-auth-store';
import { useEffect } from 'react';

export function useCurrentUserQuery() {
  const { status, updateUser } = useAuthStore();
  const query = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => request<UserSummary>('GET', '/users/me', { schema: userSummarySchema }),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) {
      updateUser(query.data);
    }
  }, [query.data, updateUser]);

  return query;
}
