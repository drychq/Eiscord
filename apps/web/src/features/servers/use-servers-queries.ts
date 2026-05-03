import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../../shared/state/use-toast-store';
import { formatErrorMessage } from '../../shared/utils/error-message';
import { fetchServers, fetchServerDetail, createServer, joinServer, leaveServer } from './servers-api';

export function useServersList() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: fetchServers,
    staleTime: 60_000,
  });
}

export function useServerDetail(serverId: string | null) {
  return useQuery({
    queryKey: ['servers', serverId],
    queryFn: () => fetchServerDetail(serverId!),
    enabled: !!serverId,
    staleTime: 30_000,
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      createServer(name, description),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      pushToast({
        kind: 'success',
        message: `社区 "${data.server.name}" 已创建`,
        ttl: 3000,
      });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useJoinServer() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (inviteCode: string) => joinServer(inviteCode),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      pushToast({
        kind: 'success',
        message: `已加入社区 "${data.name}"`,
        ttl: 3000,
      });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useLeaveServer() {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (serverId: string) => leaveServer(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      pushToast({ kind: 'success', message: '已退出社区', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}
