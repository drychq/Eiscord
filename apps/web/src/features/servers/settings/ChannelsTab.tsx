import { useState } from 'react';
import { Plus, Trash2, Edit3, Hash } from 'lucide-react';
import { useCreateChannel, useUpdateChannel, useDeleteChannel } from '../use-servers-queries';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { useServerSettingsContext } from './types';
import { ChannelFormModal } from './modals/ChannelFormModal';
import type { ChannelSummary } from '../servers-api';

export function ChannelsTab() {
  const { server, canManageChannel } = useServerSettingsContext();
  const channels = server.channels;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChannelSummary | null>(null);

  const createMutation = useCreateChannel(server.server_id);
  const updateMutation = useUpdateChannel(editingChannel?.channel_id ?? '');
  const deleteMutation = useDeleteChannel(deleteTarget?.channel_id ?? '');

  const textChannels = channels.filter((c) => c.type === 'text' || c.type === 'TEXT');
  const voiceChannels = channels.filter((c) => c.type === 'voice' || c.type === 'VOICE');

  return (
    <div>
      <div className="settings-header">
        <h2>频道管理</h2>
        {canManageChannel && (
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
            <span>
              {label} — {items.length}
            </span>
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
                  {canManageChannel && (
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
