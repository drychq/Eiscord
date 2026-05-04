import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToastStore } from '../../shared/state/use-toast-store';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
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
    staleTime: 5_000,
  });
}

export function useJoinVoiceChannel(channelId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (input: JoinVoiceInput = {}) => joinVoiceChannel(channelId, input),
    onSuccess: (session) => {
      useWorkspaceStore.getState().setActiveVoiceSession(session);
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
