import { useState } from 'react';
import { Plus, Link2, Copy, Check, Trash2 } from 'lucide-react';
import { useServerInvites, useCreateInvite, useRevokeInvite } from '../use-servers-queries';
import { buildInviteLink } from '../invite-link';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { Spinner } from '../../../shared/components/Spinner';
import { useServerSettingsContext } from './types';
import type { InviteSummary } from '../servers-api';

export function InvitesTab() {
  const { serverId, canCreateInvite } = useServerSettingsContext();
  const { data: invites, isLoading } = useServerInvites(serverId);
  const createMutation = useCreateInvite(serverId);
  const revokeMutation = useRevokeInvite(serverId);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteSummary | null>(null);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteLink(code));
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    } catch {
      // 剪贴板不可用时静默失败
    }
  };

  return (
    <div>
      <div className="settings-header">
        <h2>邀请</h2>
        {canCreateInvite && (
          <button
            className="button-primary"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            <Plus size={16} />
            生成邀请
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner size={32} />
        </div>
      ) : !invites || invites.length === 0 ? (
        <div className="settings-empty">暂无邀请</div>
      ) : (
        <ul className="settings-list">
          {invites.map((invite) => (
            <li key={invite.invite_id} className="settings-list-item">
              <Link2 size={18} />
              <div className="item-info">
                <span className="item-name">{invite.code}</span>
                <span className="item-meta">
                  {invite.creator.nickname} · 已使用 {invite.used_count} 次
                </span>
              </div>
              <div className="item-actions">
                <button
                  className="icon-button"
                  onClick={() => void handleCopy(invite.code)}
                  aria-label={`复制邀请链接 ${invite.code}`}
                >
                  {copiedCode === invite.code ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  className="icon-button"
                  onClick={() => setRevokeTarget(invite)}
                  aria-label={`撤销邀请 ${invite.code}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        title="撤销邀请"
        message={`确定要撤销邀请 "${revokeTarget?.code}" 吗？该链接将立即失效。`}
        confirmLabel="撤销"
        variant="danger"
        onConfirm={() => {
          if (!revokeTarget) return;
          revokeMutation.mutate(revokeTarget.invite_id, {
            onSuccess: () => setRevokeTarget(null),
          });
        }}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
