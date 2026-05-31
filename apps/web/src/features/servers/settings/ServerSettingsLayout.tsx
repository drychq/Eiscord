import { useMemo } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Shield, Users, Hash, Link2 } from 'lucide-react';
import { PermissionBit, hasPermissionBit } from '@eiscord/shared';
import { useServerDetail, useServerRoles } from '../use-servers-queries';
import { Spinner } from '../../../shared/components/Spinner';
import type { ServerSettingsContext } from './types';

export function ServerSettingsLayout() {
  const { serverId } = useParams<{ serverId: string }>();
  const { data: server, isLoading } = useServerDetail(serverId ?? null);
  const { data: roles } = useServerRoles(serverId ?? null);

  const context = useMemo<ServerSettingsContext | null>(() => {
    if (!server || !serverId) return null;
    const effectiveRoles = roles ?? server.roles;
    const currentRoles = effectiveRoles.filter((r) =>
      server.current_member.role_ids.includes(r.role_id),
    );
    const currentPerms = currentRoles.reduce(
      (acc, r) => acc | BigInt(r.permission_bits),
      BigInt(0),
    );
    const isOwner = server.owner_id === server.current_member.user.user_id;
    return {
      serverId,
      server,
      roles: effectiveRoles,
      canManageRole: isOwner || hasPermissionBit(currentPerms, PermissionBit.ManageRole),
      canManageMember: isOwner || hasPermissionBit(currentPerms, PermissionBit.ManageMember),
      canManageChannel: isOwner || hasPermissionBit(currentPerms, PermissionBit.ManageChannel),
      canCreateInvite: isOwner || hasPermissionBit(currentPerms, PermissionBit.CreateInvite),
    };
  }, [server, roles, serverId]);

  if (isLoading || !context) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner size={32} />
      </div>
    );
  }

  const tabs: { key: 'roles' | 'members' | 'channels' | 'invites'; label: string; visible: boolean; icon: typeof Shield }[] = [
    { key: 'roles', label: '角色', visible: context.canManageRole, icon: Shield },
    { key: 'members', label: '成员', visible: context.canManageMember, icon: Users },
    { key: 'channels', label: '频道', visible: context.canManageChannel, icon: Hash },
    { key: 'invites', label: '邀请', visible: context.canCreateInvite, icon: Link2 },
  ];

  return (
    <div className="settings-page">
      <div className="settings-tabs">
        {tabs
          .filter((t) => t.visible)
          .map(({ key, label, icon: Icon }) => (
            <NavLink
              key={key}
              to={key}
              className={({ isActive }) => `settings-tab${isActive ? ' active' : ''}`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
      </div>
      <div className="settings-body">
        <Outlet context={context} />
      </div>
    </div>
  );
}
