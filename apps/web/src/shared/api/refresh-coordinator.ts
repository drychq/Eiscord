import { request } from './http-client';
import { refreshResponseSchema } from '@eiscord/shared';
import { useAuthStore } from '../state/use-auth-store';

let pendingRefresh: Promise<boolean> | null = null;

export async function tryRefresh(): Promise<boolean> {
  if (pendingRefresh) {
    return pendingRefresh;
  }

  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    return false;
  }

  pendingRefresh = (async () => {
    try {
      const data = await request<{
        access_token: string;
        refresh_token: string;
        user: unknown;
      }>('POST', '/auth/refresh', {
        body: { refresh_token: refreshToken },
        schema: refreshResponseSchema,
      });

      useAuthStore.getState().setSession({
        access: data.access_token,
        refresh: data.refresh_token,
        user: data.user as Parameters<ReturnType<typeof useAuthStore.getState>['setSession']>[0]['user'],
      });
      return true;
    } catch {
      useAuthStore.getState().clearSession();
      return false;
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}
