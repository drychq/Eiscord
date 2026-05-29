import { useState } from 'react';
import { Plus, Shield, Edit3, Trash2 } from 'lucide-react';
import { PermissionBitEditor } from '../../components/PermissionBitEditor';
import type { ChannelSummary, PermissionOverwriteInput } from '../../servers-api';

type ChannelFormInitial = Pick<
  ChannelSummary,
  'name' | 'type' | 'topic' | 'permission_overwrites'
>;

type Props = {
  initial: ChannelFormInitial | null;
  onClose: () => void;
  onSave: (data: {
    name?: string;
    type?: string;
    topic?: string;
    permission_overwrites?: PermissionOverwriteInput[];
  }) => void;
  saving: boolean;
};

export function ChannelFormModal({ initial, onClose, onSave, saving }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(
    initial?.type === 'voice' || initial?.type === 'VOICE' ? 'voice' : 'text',
  );
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const [overwrites, setOverwrites] = useState<PermissionOverwriteInput[]>(
    initial?.permission_overwrites ?? [],
  );
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [editTargetType, setEditTargetType] = useState<'role' | 'member'>('role');
  const [editTargetId, setEditTargetId] = useState('');
  const [editAllowBits, setEditAllowBits] = useState('0');
  const [editDenyBits, setEditDenyBits] = useState('0');

  const startEdit = (idx: number) => {
    const ow = overwrites[idx];
    setEditingIdx(idx);
    setAddingNew(false);
    setEditTargetType(ow.target_type as 'role' | 'member');
    setEditTargetId(ow.target_id);
    setEditAllowBits(ow.allow_bits);
    setEditDenyBits(ow.deny_bits);
  };

  const startAdd = () => {
    setEditingIdx(null);
    setAddingNew(true);
    setEditTargetType('role');
    setEditTargetId('');
    setEditAllowBits('0');
    setEditDenyBits('0');
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setAddingNew(false);
  };

  const saveOverwrite = () => {
    if (!editTargetId.trim()) return;
    const newOw: PermissionOverwriteInput = {
      target_type: editTargetType,
      target_id: editTargetId.trim(),
      allow_bits: editAllowBits,
      deny_bits: editDenyBits,
    };
    if (editingIdx !== null) {
      const updated = [...overwrites];
      updated[editingIdx] = newOw;
      setOverwrites(updated);
    } else {
      setOverwrites([...overwrites, newOw]);
    }
    cancelEdit();
  };

  const deleteOverwrite = (idx: number) => {
    setOverwrites(overwrites.filter((_, i) => i !== idx));
    if (editingIdx === idx) cancelEdit();
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? '编辑频道' : '创建频道'}</h3>
        <div className="settings-form">
          <label htmlFor="channel-name">名称</label>
          <input
            id="channel-name"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="频道名称"
          />
          <label htmlFor="channel-type">类型</label>
          <select
            id="channel-type"
            className="form-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="text">文本频道</option>
            <option value="voice">语音频道</option>
          </select>
          <label htmlFor="channel-topic">主题</label>
          <input
            id="channel-topic"
            className="form-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={280}
            placeholder="频道主题（可选）"
          />

          <label style={{ marginTop: 16 }}>权限覆盖</label>
          {overwrites.length > 0 && (
            <ul className="settings-list" style={{ marginBottom: 8 }}>
              {overwrites.map((ow, idx) => (
                <li
                  key={idx}
                  className="settings-list-item"
                  style={{ justifyContent: 'space-between' }}
                >
                  <span className="item-name">
                    <Shield size={14} style={{ marginRight: 6 }} />
                    {ow.target_type}:{ow.target_id.slice(0, 8)}...
                  </span>
                  <div className="item-actions">
                    <button className="icon-button" onClick={() => startEdit(idx)} aria-label="编辑覆盖">
                      <Edit3 size={14} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => deleteOverwrite(idx)}
                      aria-label="删除覆盖"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editingIdx !== null || addingNew ? (
            <div style={{ border: '1px solid #3a3c40', borderRadius: 6, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select
                  className="form-select"
                  value={editTargetType}
                  onChange={(e) => setEditTargetType(e.target.value as 'role' | 'member')}
                  style={{ flex: 1 }}
                >
                  <option value="role">角色</option>
                  <option value="member">成员</option>
                </select>
                <input
                  className="form-input"
                  placeholder="Target ID"
                  value={editTargetId}
                  onChange={(e) => setEditTargetId(e.target.value)}
                  style={{ flex: 2 }}
                />
              </div>
              <div style={{ marginBottom: 4 }}>
                <span className="item-meta">允许权限</span>
                <PermissionBitEditor value={editAllowBits} onChange={setEditAllowBits} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <span className="item-meta">拒绝权限</span>
                <PermissionBitEditor value={editDenyBits} onChange={setEditDenyBits} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button-primary" onClick={saveOverwrite} style={{ fontSize: 13 }}>
                  保存
                </button>
                <button className="button-secondary" onClick={cancelEdit} style={{ fontSize: 13 }}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button className="button-secondary" onClick={startAdd} style={{ fontSize: 13 }}>
              <Plus size={14} /> 添加覆盖
            </button>
          )}
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
                type,
                topic: topic.trim() || undefined,
                permission_overwrites: overwrites.length > 0 ? overwrites : undefined,
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
