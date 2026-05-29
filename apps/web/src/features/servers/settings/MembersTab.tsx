import { useState } from 'react';
import { Shield, X, Edit3, Trash2 } from 'lucide-react';
import { useManageMember, useAssignRole, useRemoveRole } from '../use-servers-queries';
import { RoleBadge } from '../components/RoleBadge';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { useServerSettingsContext } from './types';
import { RoleAssignModal } from './modals/RoleAssignModal';
import type { MemberSummary } from '../servers-api';

export function MembersTab() {
  const { serverId, server, roles, canManageMember } = useServerSettingsContext();
  const members = server.members;
  const ownerId = server.owner_id;

  const [roleTarget, setRoleTarget] = useState<MemberSummary | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberSummary | null>(null);
  const [muteTarget, setMuteTarget] = useState<MemberSummary | null>(null);

  const manageMutation = useManageMember(serverId);
  const assignMutation = useAssignRole(serverId);
  const removeRoleMutation = useRemoveRole(serverId);

  const online = members.filter((m) => m.user.presence_status.toLowerCase() !== 'offline');
  const offline = members.filter((m) => m.user.presence_status.toLowerCase() === 'offline');

  const isOwnerMember = (m: MemberSummary) => m.user.user_id === ownerId;

  return (
    <div>
      <div className="settings-header">
        <h2>成员管理</h2>
      </div>

      {[online, offline].map(
        (group, gi) =>
          group.length > 0 && (
            <div key={gi}>
              <div className="section-title">
                <span>{gi === 0 ? `在线 — ${group.length}` : `离线 — ${group.length}`}</span>
              </div>
              <ul className="settings-list">
                {group.map((member) => (
                  <li key={member.membership_id} className="settings-list-item">
                    <div className="presence online" />
                    <div className="item-info">
                      <span className="item-name">
                        {member.nick_in_server ?? member.user.nickname}
                        {isOwnerMember(member) && (
                          <span style={{ color: '#d48b2a', marginLeft: 6, fontSize: 11 }}>
                            所有者
                          </span>
                        )}
                      </span>
                      <span className="item-meta">{member.user.username}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {member.role_ids.map((rid) => {
                        const role = roles.find((r) => r.role_id === rid);
                        return role ? (
                          <RoleBadge key={rid} name={role.name} color={role.color} />
                        ) : null;
                      })}
                    </div>
                    {canManageMember && !isOwnerMember(member) && (
                      <div className="item-actions">
                        <button
                          className="tiny-button"
                          onClick={() => setRoleTarget(member)}
                          aria-label="管理角色"
                        >
                          <Shield size={12} />
                        </button>
                        {member.member_status.toLowerCase() === 'muted' ? (
                          <button
                            className="tiny-button"
                            onClick={() => {
                              manageMutation.mutate({
                                memberId: member.membership_id,
                                action: 'restore',
                              });
                            }}
                            aria-label="恢复"
                          >
                            <Edit3 size={12} />
                          </button>
                        ) : (
                          <button
                            className="tiny-button"
                            onClick={() => setMuteTarget(member)}
                            aria-label="禁言"
                          >
                            <X size={12} />
                          </button>
                        )}
                        <button
                          className="tiny-button"
                          onClick={() => setRemoveTarget(member)}
                          aria-label="移除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}

      {roleTarget && (
        <RoleAssignModal
          member={roleTarget}
          roles={roles}
          assignedIds={roleTarget.role_ids}
          onAssign={(roleId) => {
            assignMutation.mutate(
              { memberId: roleTarget.membership_id, roleId },
              { onSuccess: () => setRoleTarget(null) },
            );
          }}
          onRemove={(roleId) => {
            removeRoleMutation.mutate(
              { memberId: roleTarget.membership_id, roleId },
              { onSuccess: () => setRoleTarget(null) },
            );
          }}
          onClose={() => setRoleTarget(null)}
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="移除成员"
        message={`确定要将 "${removeTarget?.nick_in_server ?? removeTarget?.user.nickname}" 移出社区吗？`}
        confirmLabel="移除"
        variant="danger"
        onConfirm={() => {
          manageMutation.mutate({ memberId: removeTarget!.membership_id, action: 'remove' });
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={!!muteTarget}
        title="禁言成员"
        message={`确定要禁言 "${muteTarget?.nick_in_server ?? muteTarget?.user.nickname}" 吗？`}
        confirmLabel="禁言"
        variant="danger"
        onConfirm={() => {
          manageMutation.mutate({ memberId: muteTarget!.membership_id, action: 'mute' });
          setMuteTarget(null);
        }}
        onCancel={() => setMuteTarget(null)}
      />
    </div>
  );
}
