import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../shared/state/use-auth-store';
import { useToastStore } from '../../shared/state/use-toast-store';
import { formatErrorMessage } from '../../shared/utils/error-message';
import { fetchCurrentUser, updateProfile } from './profile-api';
import type { UpdateProfileRequest } from '@eiscord/shared';

export function useCurrentUserQuery() {
  const { status, updateUser } = useAuthStore();

  return {
    status,
    async refresh() {
      try {
        const user = await fetchCurrentUser();
        updateUser(user);
        return user;
      } catch {
        // handled by AuthInitializer on mount
        return null;
      }
    },
  };
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  const { updateUser } = useAuthStore();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (input: UpdateProfileRequest) => updateProfile(input),
    onSuccess: (user) => {
      updateUser(user);
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      pushToast({ kind: 'success', message: '个人资料已更新', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}
