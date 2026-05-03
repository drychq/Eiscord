import { QueryClient } from '@tanstack/react-query';
import { ErrorCode } from '@eiscord/shared';
import { isApiError } from './api-error';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (_failureCount, error) => {
          if (isApiError(error)) {
            if (
              error.code === ErrorCode.AuthRequired ||
              error.code === ErrorCode.PermissionDenied ||
              error.code === ErrorCode.ValidationFailed
            ) {
              return false;
            }
          }
          return true;
        },
      },
      mutations: {
        retry: (_failureCount, error) => {
          if (isApiError(error)) {
            if (error.code === ErrorCode.ValidationFailed) {
              return false;
            }
          }
          return false;
        },
      },
    },
  });
}
