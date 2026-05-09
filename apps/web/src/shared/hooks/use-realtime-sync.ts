import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import * as socket from '../api/socket-client';
import { useAuthStore } from '../state/use-auth-store';
import { useToastStore } from '../state/use-toast-store';
import { useWorkspaceStore } from '../state/use-workspace-store';

export function useRealtimePermissionSync() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast } = useToastStore();

  useEffect(() => {
    const unregister = socket.onPermissionChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });

      pushToast({
        kind: 'info',
        message: '权限已变更，页面数据已刷新',
        ttl: 3000,
      });

      const isInServer = location.pathname.startsWith('/app/servers/');
      if (isInServer) {
        queryClient.invalidateQueries({ queryKey: ['servers'], exact: false });
      }
    });

    return unregister;
  }, [queryClient, navigate, location.pathname, pushToast]);
}

export function useRealtimeEventSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateMessages = (payload: unknown) => {
      const data = unwrapPayload(payload) as {
        channel_id?: string | null;
        conversation_id?: string | null;
      };

      if (data.channel_id) {
        queryClient.invalidateQueries({ queryKey: ['messages', 'channel', data.channel_id] });
      }

      if (data.conversation_id) {
        queryClient.invalidateQueries({ queryKey: ['messages', 'dm', data.conversation_id] });
      }
    };

    const invalidateNotifications = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    const invalidatePresence = () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    };

    const invalidateVoice = (payload: unknown) => {
      const data = unwrapPayload(payload) as { channel_id?: string };

      if (data.channel_id) {
        queryClient.invalidateQueries({ queryKey: ['voice', data.channel_id] });
      }
    };

    const handleVoiceLeft = (payload: unknown) => {
      invalidateVoice(payload);
      const data = unwrapPayload(payload) as { user_id?: string };
      const currentUserId = useAuthStore.getState().currentUser?.user_id;

      if (data.user_id && data.user_id === currentUserId) {
        useWorkspaceStore.getState().setActiveVoiceSession(null);
      }
    };

    socket.on('MessageCreated', invalidateMessages);
    socket.on('MessageDeleted', invalidateMessages);
    socket.on('UnreadUpdated', invalidateMessages);
    socket.on('NotificationCreated', invalidateNotifications);
    socket.on('PresenceChanged', invalidatePresence);
    socket.on('MemberChanged', invalidatePresence);
    socket.on('MemberJoined', invalidatePresence);
    socket.on('VoiceMemberJoined', invalidateVoice);
    socket.on('VoiceStateChanged', invalidateVoice);
    socket.on('VoiceMemberLeft', handleVoiceLeft);
    socket.on('VoiceProducerCreated', invalidateVoice);
    socket.on('VoiceProducerClosed', invalidateVoice);
    socket.on('VoiceActiveSpeaker', invalidateVoice);

    return () => {
      socket.off('MessageCreated', invalidateMessages);
      socket.off('MessageDeleted', invalidateMessages);
      socket.off('UnreadUpdated', invalidateMessages);
      socket.off('NotificationCreated', invalidateNotifications);
      socket.off('PresenceChanged', invalidatePresence);
      socket.off('MemberChanged', invalidatePresence);
      socket.off('MemberJoined', invalidatePresence);
      socket.off('VoiceMemberJoined', invalidateVoice);
      socket.off('VoiceStateChanged', invalidateVoice);
      socket.off('VoiceMemberLeft', handleVoiceLeft);
      socket.off('VoiceProducerCreated', invalidateVoice);
      socket.off('VoiceProducerClosed', invalidateVoice);
      socket.off('VoiceActiveSpeaker', invalidateVoice);
    };
  }, [queryClient]);
}

export function useRealtimeReconnectionSync() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  useEffect(() => {
    const handleStateSync = (state: unknown) => {
      const data = state as { unreads?: unknown[]; voice_session?: unknown };
      if (data.unreads !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['messages'] });
      }
      if (data.voice_session !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['voice'] });
      }
    };

    const handleReconnecting = (attempt: number) => {
      pushToast({
        kind: 'info',
        message: `正在重新连接... (第 ${attempt} 次尝试)`,
        ttl: 0,
      });
    };

    const handleReconnectError = () => {
      pushToast({
        kind: 'error',
        message: '重新连接失败，正在重试...',
        ttl: 5000,
      });
    };

    const handleReconnectFailed = () => {
      pushToast({
        kind: 'error',
        message: '无法连接到服务器，请刷新页面重试',
        ttl: 10000,
      });
    };

    const unregisters = [
      socket.onStateSync(handleStateSync),
      socket.onReconnecting(handleReconnecting),
      socket.onReconnectError(handleReconnectError),
      socket.onReconnectFailed(handleReconnectFailed),
    ];

    return () => unregisters.forEach((fn) => fn());
  }, [queryClient, pushToast]);
}

function unwrapPayload(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'payload' in payload) {
    return (payload as { payload: unknown }).payload;
  }

  return payload;
}
