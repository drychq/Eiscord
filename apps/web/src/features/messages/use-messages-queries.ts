import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../../shared/state/use-toast-store';
import { formatErrorMessage } from '../../shared/utils/error-message';
import {
  fetchChannelMessages,
  sendChannelMessage,
  fetchDmMessages,
  sendDmMessage,
  markRead,
  deleteMessage,
  type SendMessageInput,
  type MarkReadInput,
} from './messages-api';

export function useChannelMessages(channelId: string | null) {
  return useInfiniteQuery({
    queryKey: ['messages', 'channel', channelId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchChannelMessages(channelId!, { cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!channelId,
    staleTime: 10_000,
  });
}

export function useDmMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: ['messages', 'dm', conversationId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchDmMessages(conversationId!, { cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!conversationId,
    staleTime: 10_000,
  });
}

export function useSendChannelMessage(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageInput) => sendChannelMessage(channelId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', 'channel', channelId] });
    },
    onError: (error) => {
      useToastStore.getState().pushToast({
        kind: 'error',
        message: formatErrorMessage(error),
        ttl: 5000,
      });
    },
  });
}

export function useSendDmMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageInput) => sendDmMessage(conversationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', 'dm', conversationId] });
    },
    onError: (error) => {
      useToastStore.getState().pushToast({
        kind: 'error',
        message: formatErrorMessage(error),
        ttl: 5000,
      });
    },
  });
}

export function useMarkRead() {
  return useMutation({
    mutationFn: (data: MarkReadInput) => markRead(data),
  });
}

export function useDeleteMessage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: ({
      messageId,
      operation,
      reason,
    }: {
      messageId: string;
      operation: 'retract' | 'delete';
      reason?: string;
    }) => deleteMessage(messageId, operation, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}
