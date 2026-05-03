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
