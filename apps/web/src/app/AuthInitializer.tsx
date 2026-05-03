import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '../shared/state/use-auth-store';
import { request } from '../shared/api/http-client';
import { userSummarySchema, type UserSummary } from '@eiscord/shared';
import * as socket from '../shared/api/socket-client';

export function AuthInitializer({ children }: { children: ReactNode }) {
  const { status, accessToken, clearSession } = useAuthStore();

  useEffect(() => {
    if (status === 'authenticated' && accessToken) {
      request<UserSummary>('GET', '/users/me', { schema: userSummarySchema })
        .then((user) => {
          useAuthStore.getState().updateUser(user);
          socket.connect(accessToken);
        })
        .catch(() => {
          clearSession();
        });
    }
  }, [status, accessToken, clearSession]);

  return <>{children}</>;
}
