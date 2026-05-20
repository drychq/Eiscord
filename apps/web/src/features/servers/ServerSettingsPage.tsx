import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Settings,
  Shield,
  Users,
  Hash,
  Plus,
  Trash2,
  Edit3,
  X,
} from 'lucide-react';
import { PermissionBit, hasPermissionBit } from '@eiscord/shared';
import { useServerDetail } from './use-servers-queries';
import {
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useAssignRole,
  useRemoveRole,
  useManageMember,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
} from './use-servers-queries';
import { useServerRoles } from './use-servers-queries';
import { RoleBadge } from '../../shared/components/RoleBadge';
import { PermissionBitEditor } from '../../shared/components/PermissionBitEditor';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog';
import { Spinner } from '../../shared/components/Spinner';
import type { MemberSummary, PermissionOverwriteInput, RoleSummary } from './servers-api';

type Tab = 'roles' | 'members' | 'channels';

export function ServerSettingsPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { data: server, isLoading } = useServerDetail(serverId ?? null);
  const { data: roles } = useServerRoles(serverId ?? null);
  const [activeTab, setActiveTab] = useState<Tab>('roles');

  if (isLoading || !server) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner size={32} />
      </div>
    );
  }

  const currentRoles = (roles ?? server.roles).filter((r) =>
    server.current_member.role_ids.includes(r.role_id),
  );
  const currentPerms = currentRoles.reduce(
    (acc, r) => acc | BigInt(r.permission_bits),
    BigInt(0),
  );

  const canManageRole = hasPermissionBit(currentPerms, PermissionBit.ManageRole);
  const canManageMember = hasPermissionBit(currentPerms, PermissionBit.ManageMember);
  const canManageChannel = hasPermissionBit(currentPerms, PermissionBit.ManageChannel);
  const isOwner = server.owner_id === server.current_member.user.user_id;

  const visibleTabs: { key: Tab; label: string; icon: typeof Settings }[] = [];
  if (canManageRole || isOwner) visibleTabs.push({ key: 'roles', label: '角色', icon: Shield });
  if (canManageMember || isOwner) visibleTabs.push({ key: 'members', label: '成员', icon: Users });
  if (canManageChannel || isOwner) visibleTabs.push({ key: 'channels', label: '频道', icon: Hash });

  return (
    <div className="settings-page">
      <div className="settings-tabs">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`settings-tab${activeTab === key ? ' active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="settings-body">
        {activeTab === 'roles' && (
          <RolesTab
            serverId={serverId!}
            roles={roles ?? server.roles}
            canManage={canManageRole || isOwner}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            serverId={serverId!}
            members={server.members}
            roles={roles ?? server.roles}
            ownerId={server.owner_id}
            canManage={canManageMember || isOwner}
          />
        )}
        {activeTab === 'channels' && (
          <ChannelsTab
            serverId={serverId!}
            channels={server.channels}
            canManage={canManageChannel || isOwner}
          />
        )}
      </div>
    </div>
  );
}

/* ── Roles Tab ── */

function RolesTab({
  serverId,
  roles,
  canManage,
}: {
  serverId: string;
  roles: RoleSummary[];
  canManage: boolean;
}) {
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
        {canManage && (
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
              {canManage && !role.is_default && (
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
                { name: data.name!, permission_bits: data.permission_bits!, color: data.color, priority: data.priority },
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

/* ── Members Tab ── */

function MembersTab({
  serverId,
  members,
  roles,
  ownerId,
  canManage,
}: {
  serverId: string;
  members: MemberSummary[];
  roles: RoleSummary[];
  ownerId: string;
  canManage: boolean;
}) {
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
                    {canManage && !isOwnerMember(member) && (
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
                              manageMutation.mutate({ memberId: member.membership_id, action: 'restore' });
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

/* ── Channels Tab ── */

function ChannelsTab({
  serverId,
  channels,
  canManage,
}: {
  serverId: string;
  channels: { channel_id: string; name: string; type: string; topic: string | null; sort_order: number; permission_overwrites?: PermissionOverwriteInput[] }[];
  canManage: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<typeof channels[number] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<typeof channels[number] | null>(null);

  const createMutation = useCreateChannel(serverId);
  const updateMutation = useUpdateChannel(editingChannel?.channel_id ?? '');
  const deleteMutation = useDeleteChannel(deleteTarget?.channel_id ?? '');

  const textChannels = channels.filter((c) => c.type === 'text' || c.type === 'TEXT');
  const voiceChannels = channels.filter((c) => c.type === 'voice' || c.type === 'VOICE');

  return (
    <div>
      <div className="settings-header">
        <h2>频道管理</h2>
        {canManage && (
          <button
            className="button-primary"
            onClick={() => {
              setEditingChannel(null);
              setModalOpen(true);
            }}
          >
            <Plus size={16} />
            创建频道
          </button>
        )}
      </div>

      {[
        ['文本频道', textChannels] as const,
        ['语音频道', voiceChannels] as const,
      ].map(([label, items]) => (
        <div key={label} style={{ marginBottom: 18 }}>
          <div className="section-title">
            <span>{label} — {items.length}</span>
          </div>
          {items.length === 0 ? (
            <div className="settings-empty">暂无{label}</div>
          ) : (
            <ul className="settings-list">
              {items.map((ch) => (
                <li key={ch.channel_id} className="settings-list-item">
                  <Hash size={16} style={{ color: '#6b6d70' }} />
                  <div className="item-info">
                    <span className="item-name">{ch.name}</span>
                    {ch.topic && <span className="item-meta">{ch.topic}</span>}
                  </div>
                  {canManage && (
                    <div className="item-actions">
                      <button
                        className="icon-button"
                        onClick={() => {
                          setEditingChannel(ch);
                          setModalOpen(true);
                        }}
                        aria-label={`编辑 ${ch.name}`}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => setDeleteTarget(ch)}
                        aria-label={`删除 ${ch.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {modalOpen && (
        <ChannelFormModal
          initial={editingChannel}
          onClose={() => setModalOpen(false)}
          onSave={(data) => {
            if (editingChannel) {
              updateMutation.mutate(
                { ...data, type: data.type as 'text' | 'voice' | undefined },
                { onSuccess: () => setModalOpen(false) },
              );
            } else {
              createMutation.mutate(
                { name: data.name!, type: data.type as 'text' | 'voice', topic: data.topic },
                { onSuccess: () => setModalOpen(false) },
              );
            }
          }}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除频道"
        message={`确定要删除频道 "${deleteTarget?.name}" 吗？所有消息将不可恢复。`}
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

/* ── Modals ── */

function RoleFormModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: RoleSummary | null;
  onClose: () => void;
  onSave: (data: { name?: string; permission_bits?: string; color?: string; priority?: number }) => void;
  saving: boolean;
}) {
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

function ChannelFormModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: { name: string; type: string; topic: string | null; permission_overwrites?: PermissionOverwriteInput[] } | null;
  onClose: () => void;
  onSave: (data: { name?: string; type?: string; topic?: string; permission_overwrites?: PermissionOverwriteInput[] }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type === 'voice' || initial?.type === 'VOICE' ? 'voice' : 'text');
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const [overwrites, setOverwrites] = useState<PermissionOverwriteInput[]>(initial?.permission_overwrites ?? []);
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
                <li key={idx} className="settings-list-item" style={{ justifyContent: 'space-between' }}>
                  <span className="item-name">
                    <Shield size={14} style={{ marginRight: 6 }} />
                    {ow.target_type}:{ow.target_id.slice(0, 8)}...
                  </span>
                  <div className="item-actions">
                    <button className="icon-button" onClick={() => startEdit(idx)} aria-label="编辑覆盖">
                      <Edit3 size={14} />
                    </button>
                    <button className="icon-button" onClick={() => deleteOverwrite(idx)} aria-label="删除覆盖">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(editingIdx !== null || addingNew) ? (
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

function RoleAssignModal({
  member,
  roles,
  assignedIds,
  onAssign,
  onRemove,
  onClose,
}: {
  member: MemberSummary;
  roles: RoleSummary[];
  assignedIds: string[];
  onAssign: (roleId: string) => void;
  onRemove: (roleId: string) => void;
  onClose: () => void;
}) {
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
