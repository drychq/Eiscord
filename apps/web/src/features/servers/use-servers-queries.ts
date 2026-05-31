import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../../shared/state/use-toast-store';
import { formatErrorMessage } from '../../shared/utils/error-message';
import {
  fetchServers,
  fetchServerDetail,
  createServer,
  joinServer,
  leaveServer,
  fetchServerMembers,
  fetchServerRoles,
  manageMember,
  createRole,
  updateRole,
  deleteRole,
  assignRole,
  removeRole,
  createChannel,
  updateChannel,
  deleteChannel,
  fetchServerInvites,
  createInvite,
  revokeInvite,
  type ManageMemberAction,
  type PermissionOverwriteInput,
} from './servers-api';

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

export function useServerMembers(serverId: string | null) {
  return useQuery({
    queryKey: ['servers', serverId, 'members'],
    queryFn: () => fetchServerMembers(serverId!),
    enabled: !!serverId,
  });
}

export function useServerRoles(serverId: string | null) {
  return useQuery({
    queryKey: ['servers', serverId, 'roles'],
    queryFn: () => fetchServerRoles(serverId!),
    enabled: !!serverId,
  });
}

export function useManageMember(serverId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: ({
      memberId,
      action,
      reason,
    }: {
      memberId: string;
      action: ManageMemberAction;
      reason?: string;
    }) => manageMember(serverId, memberId, action, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['servers', serverId] });
      pushToast({ kind: 'success', message: '操作成功', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useCreateRole(serverId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (data: {
      name: string;
      permission_bits: string;
      color?: string;
      priority?: number;
    }) => createRole(serverId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'roles'] });
      queryClient.invalidateQueries({ queryKey: ['servers', serverId] });
      pushToast({ kind: 'success', message: '角色已创建', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useUpdateRole(serverId: string, roleId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (data: {
      name?: string;
      permission_bits?: string;
      color?: string;
      priority?: number;
    }) => updateRole(serverId, roleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      pushToast({ kind: 'success', message: '角色已更新', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useDeleteRole(serverId: string, roleId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: () => deleteRole(serverId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      pushToast({ kind: 'success', message: '角色已删除', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useAssignRole(serverId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) =>
      assignRole(serverId, memberId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['servers', serverId] });
      pushToast({ kind: 'success', message: '角色已分配', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useRemoveRole(serverId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) =>
      removeRole(serverId, memberId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['servers', serverId] });
      pushToast({ kind: 'success', message: '已移除角色', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useCreateChannel(serverId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (data: {
      name: string;
      type: 'text' | 'voice';
      topic?: string;
      sort_order?: number;
      permission_overwrites?: PermissionOverwriteInput[];
    }) => createChannel(serverId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId] });
      pushToast({ kind: 'success', message: '频道已创建', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useUpdateChannel(channelId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (data: {
      name?: string;
      type?: 'text' | 'voice';
      topic?: string;
      sort_order?: number;
      permission_overwrites?: PermissionOverwriteInput[];
    }) => updateChannel(channelId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      pushToast({ kind: 'success', message: '频道已更新', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useDeleteChannel(channelId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: () => deleteChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      pushToast({ kind: 'success', message: '频道已删除', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useServerInvites(serverId: string | null) {
  return useQuery({
    queryKey: ['servers', serverId, 'invites'],
    queryFn: () => fetchServerInvites(serverId!),
    enabled: !!serverId,
  });
}

export function useCreateInvite(serverId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: () => createInvite(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'invites'] });
      pushToast({ kind: 'success', message: '邀请已创建', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useRevokeInvite(serverId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(serverId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'invites'] });
      pushToast({ kind: 'success', message: '邀请已撤销', ttl: 3000 });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}
