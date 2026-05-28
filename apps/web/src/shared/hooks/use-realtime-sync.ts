import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import * as socket from '../api/socket-client';
import { useToastStore } from '../state/use-toast-store';

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
