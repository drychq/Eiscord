import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RealtimeEvent } from '@eiscord/shared';

import { useAuthStore } from '../../shared/state/use-auth-store';
import { useToastStore } from '../../shared/state/use-toast-store';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
import { useRealtimeSubscription } from '../../shared/api/realtime-registry';
import { formatErrorMessage } from '../../shared/utils/error-message';
import {
  joinVoiceChannel,
  leaveVoiceSession,
  listVoiceSessions,
  updateVoiceState,
  type JoinVoiceInput,
  type UpdateVoiceStateInput,
} from './voice-api';

export function useVoiceSessions(channelId: string | null) {
  return useQuery({
    queryKey: ['voice', channelId],
    queryFn: () => listVoiceSessions(channelId!),
    enabled: !!channelId,
    refetchInterval: 1000,
    staleTime: 5_000,
  });
}

export function useJoinVoiceChannel(channelId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (input: JoinVoiceInput = {}) => joinVoiceChannel(channelId, input),
    onSuccess: (response) => {
      const { media, ...session } = response;
      const workspace = useWorkspaceStore.getState();
      workspace.setActiveVoiceSession(session);
      workspace.setPendingVoiceMedia(media);
      queryClient.invalidateQueries({ queryKey: ['voice'] });
      pushToast({ kind: 'success', message: '已加入语音频道', ttl: 2500 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useLeaveVoiceSession() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (sessionId: string) => leaveVoiceSession(sessionId),
    onSuccess: () => {
      useWorkspaceStore.getState().setActiveVoiceSession(null);
      queryClient.invalidateQueries({ queryKey: ['voice'] });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useUpdateVoiceState() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: ({ sessionId, input }: { input: UpdateVoiceStateInput; sessionId: string }) =>
      updateVoiceState(sessionId, input),
    onSuccess: (session) => {
      useWorkspaceStore.getState().setActiveVoiceSession(session);
      queryClient.invalidateQueries({ queryKey: ['voice', session.channel_id] });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useVoiceRealtime() {
  const queryClient = useQueryClient();

  const invalidateVoice = useCallback(
    (payload: unknown) => {
      const data = payload as { channel_id?: string };
      if (data.channel_id) {
        queryClient.invalidateQueries({ queryKey: ['voice', data.channel_id] });
      }
    },
    [queryClient],
  );

  const handleVoiceLeft = useCallback(
    (payload: unknown) => {
      invalidateVoice(payload);
      const data = payload as { user_id?: string };
      const currentUserId = useAuthStore.getState().currentUser?.user_id;
      if (data.user_id && data.user_id === currentUserId) {
        useWorkspaceStore.getState().setActiveVoiceSession(null);
      }
    },
    [invalidateVoice],
  );

  useRealtimeSubscription(RealtimeEvent.VoiceMemberJoined, invalidateVoice);
  useRealtimeSubscription(RealtimeEvent.VoiceStateChanged, invalidateVoice);
  useRealtimeSubscription(RealtimeEvent.VoiceMemberLeft, handleVoiceLeft);
  useRealtimeSubscription(RealtimeEvent.VoiceProducerCreated, invalidateVoice);
  useRealtimeSubscription(RealtimeEvent.VoiceProducerClosed, invalidateVoice);
  useRealtimeSubscription(RealtimeEvent.VoiceActiveSpeaker, invalidateVoice);
}
