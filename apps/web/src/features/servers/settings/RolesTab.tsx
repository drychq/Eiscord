import { useState } from 'react';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { useCreateRole, useUpdateRole, useDeleteRole } from '../use-servers-queries';
import { RoleBadge } from '../components/RoleBadge';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { useServerSettingsContext } from './types';
import { RoleFormModal } from './modals/RoleFormModal';
import type { RoleSummary } from '../servers-api';

export function RolesTab() {
  const { serverId, roles, canManageRole } = useServerSettingsContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleSummary | null>(null);

  const createMutation = useCreateRole(serverId);
  const updateMutation = useUpdateRole(serverId, editingRole?.role_id ?? '');
  const deleteMutation = useDeleteRole(serverId, deleteTarget?.role_id ?? '');

  const sorted = [...roles].sort((a, b) => b.priority - a.priority);

  return (
    <div>
      <div className="settings-header">
        <h2>角色管理</h2>
        {canManageRole && (
          <button
            className="button-primary"
            onClick={() => {
              setEditingRole(null);
              setModalOpen(true);
            }}
          >
            <Plus size={16} />
            创建角色
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="settings-empty">暂无角色</div>
      ) : (
        <ul className="settings-list">
          {sorted.map((role) => (
            <li key={role.role_id} className="settings-list-item">
              <RoleBadge name={role.name} color={role.color} />
              <div className="item-info">
                <span className="item-name">{role.name}</span>
                <span className="item-meta">
                  {role.is_default ? '默认角色' : `优先级 ${role.priority}`}
                </span>
              </div>
              {canManageRole && !role.is_default && (
                <div className="item-actions">
                  <button
                    className="icon-button"
                    onClick={() => {
                      setEditingRole(role);
                      setModalOpen(true);
                    }}
                    aria-label={`编辑 ${role.name}`}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setDeleteTarget(role)}
                    aria-label={`删除 ${role.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <RoleFormModal
          initial={editingRole}
          onClose={() => setModalOpen(false)}
          onSave={(data) => {
            if (editingRole) {
              updateMutation.mutate(data, { onSuccess: () => setModalOpen(false) });
            } else {
              createMutation.mutate(
                {
                  name: data.name!,
                  permission_bits: data.permission_bits!,
                  color: data.color,
                  priority: data.priority,
                },
                { onSuccess: () => setModalOpen(false) },
              );
            }
          }}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除角色"
        message={`确定要删除角色 "${deleteTarget?.name}" 吗？此操作不可撤销。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => {
          deleteMutation.mutate(undefined, { onSuccess: () => setDeleteTarget(null) });
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
