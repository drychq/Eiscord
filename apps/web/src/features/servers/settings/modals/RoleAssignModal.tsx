import { Plus, X } from 'lucide-react';
import { RoleBadge } from '../../components/RoleBadge';
import type { MemberSummary, RoleSummary } from '../../servers-api';

type Props = {
  member: MemberSummary;
  roles: RoleSummary[];
  assignedIds: string[];
  onAssign: (roleId: string) => void;
  onRemove: (roleId: string) => void;
  onClose: () => void;
};

export function RoleAssignModal({
  member,
  roles,
  assignedIds,
  onAssign,
  onRemove,
  onClose,
}: Props) {
  const assigned = roles.filter((r) => assignedIds.includes(r.role_id));
  const unassigned = roles.filter(
    (r) => !assignedIds.includes(r.role_id) && !r.is_default,
  );

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>管理角色 — {member.nick_in_server ?? member.user.nickname}</h3>
        {assigned.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="section-title">
              <span>已分配</span>
            </div>
            <ul className="settings-list">
              {assigned.map((role) => (
                <li key={role.role_id} className="settings-list-item">
                  <RoleBadge name={role.name} color={role.color} />
                  <div className="item-info">
                    <span className="item-name">{role.name}</span>
                  </div>
                  {!role.is_default && (
                    <button
                      className="tiny-button"
                      onClick={() => onRemove(role.role_id)}
                      aria-label={`移除 ${role.name}`}
                    >
                      <X size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {unassigned.length > 0 && (
          <div>
            <div className="section-title">
              <span>可分配</span>
            </div>
            <ul className="settings-list">
              {unassigned.map((role) => (
                <li key={role.role_id} className="settings-list-item">
                  <RoleBadge name={role.name} color={role.color} />
                  <div className="item-info">
                    <span className="item-name">{role.name}</span>
                  </div>
                  <button
                    className="tiny-button"
                    onClick={() => onAssign(role.role_id)}
                    aria-label={`分配 ${role.name}`}
                  >
                    <Plus size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="settings-modal-actions">
          <button className="button-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
