import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../../shared/state/use-toast-store';
import { formatErrorMessage } from '../../shared/utils/error-message';
import {
  fetchNotifications,
  markNotificationsRead,
  type ListNotificationsParams,
} from './notifications-api';

export function useNotificationsList(params?: ListNotificationsParams) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => fetchNotifications(params),
    staleTime: 15_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (data: { notification_ids?: string[]; mark_all?: boolean }) =>
      markNotificationsRead(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}
