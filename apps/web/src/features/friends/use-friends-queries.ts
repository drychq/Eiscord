import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RealtimeEvent } from '@eiscord/shared';
import { useToastStore } from '../../shared/state/use-toast-store';
import { useRealtimeSubscription } from '../../shared/api/realtime-registry';
import { formatErrorMessage } from '../../shared/utils/error-message';
import {
  fetchFriends,
  fetchDmConversations,
  searchUsers,
  createFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  type CreateFriendRequestInput,
} from './friends-api';

export function useFriendsList() {
  return useQuery({
    queryKey: ['friends'],
    queryFn: fetchFriends,
    staleTime: 30_000,
  });
}

export function useDmConversations() {
  return useQuery({
    queryKey: ['dm-conversations'],
    queryFn: fetchDmConversations,
    staleTime: 30_000,
  });
}

export function useUserSearch(query: string) {
  const normalizedQuery = query.trim();

  return useQuery({
    queryKey: ['user-search', normalizedQuery],
    queryFn: () => searchUsers(normalizedQuery),
    enabled: normalizedQuery.length >= 2,
    staleTime: 10_000,
  });
}

export function useCreateFriendRequest() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (input: CreateFriendRequestInput) => createFriendRequest(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['user-search'] });
      pushToast({
        kind: 'success',
        message: `好友申请已发送给 ${data.friend.username}`,
        ttl: 3000,
      });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (friendshipId: string) => acceptFriendRequest(friendshipId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
      pushToast({
        kind: 'success',
        message: `已接受 ${data.friend.username} 的好友申请`,
        ttl: 3000,
      });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useRejectFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (friendshipId: string) => rejectFriendRequest(friendshipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useFriendsRealtime() {
  const queryClient = useQueryClient();

  const invalidatePresence = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['friends'] });
    queryClient.invalidateQueries({ queryKey: ['servers'] });
  }, [queryClient]);

  useRealtimeSubscription(RealtimeEvent.PresenceChanged, invalidatePresence);
  useRealtimeSubscription(RealtimeEvent.MemberChanged, invalidatePresence);
  useRealtimeSubscription(RealtimeEvent.MemberJoined, invalidatePresence);
}
