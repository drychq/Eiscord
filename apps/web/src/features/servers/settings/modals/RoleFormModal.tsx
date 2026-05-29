import { useState } from 'react';
import { PermissionBitEditor } from '../../components/PermissionBitEditor';
import type { RoleSummary } from '../../servers-api';

type Props = {
  initial: RoleSummary | null;
  onClose: () => void;
  onSave: (data: {
    name?: string;
    permission_bits?: string;
    color?: string;
    priority?: number;
  }) => void;
  saving: boolean;
};

export function RoleFormModal({ initial, onClose, onSave, saving }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? '#2f8f83');
  const [priority, setPriority] = useState(String(initial?.priority ?? 0));
  const [permBits, setPermBits] = useState(initial?.permission_bits ?? '19');

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? '编辑角色' : '创建角色'}</h3>
        <div className="settings-form">
          <label htmlFor="role-name">名称</label>
          <input
            id="role-name"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="角色名称"
          />
          <label htmlFor="role-color">颜色</label>
          <div className="color-input-row">
            <input
              id="role-color"
              type="color"
              value={color ?? '#2f8f83'}
              onChange={(e) => setColor(e.target.value)}
            />
            <input
              className="form-input"
              value={color ?? ''}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#2f8f83"
              maxLength={20}
            />
          </div>
          <label htmlFor="role-priority">优先级</label>
          <input
            id="role-priority"
            className="form-input"
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            min={0}
          />
          <label>权限</label>
          <PermissionBitEditor value={permBits} onChange={setPermBits} />
        </div>
        <div className="settings-modal-actions">
          <button className="button-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="button-primary"
            disabled={!name.trim() || saving}
            onClick={() =>
              onSave({
                name: name.trim(),
                permission_bits: permBits,
                color: color || undefined,
                priority: Number(priority) || 0,
              })
            }
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
