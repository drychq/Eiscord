import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Server, LogIn } from 'lucide-react';
import { useServersList, useCreateServer, useJoinServer } from '../../features/servers/use-servers-queries';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
import { Spinner } from '../../shared/components/Spinner';

export function ServerRail() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const { setActiveServerId } = useWorkspaceStore();
  const { data: servers, isLoading } = useServersList();
  const createServer = useCreateServer();
  const joinServer = useJoinServer();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const handleHome = () => {
    setActiveServerId(null);
    navigate('/app/friends');
  };

  const handleServerClick = (id: string) => {
    setActiveServerId(id);
    navigate(`/app/servers/${id}/channels/default`);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (serverName.trim()) {
      createServer.mutate(
        { name: serverName.trim() },
        { onSuccess: () => { setServerName(''); setShowCreate(false); } },
      );
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteCode.trim()) {
      joinServer.mutate(inviteCode.trim(), {
        onSuccess: () => { setInviteCode(''); setShowJoin(false); },
      });
    }
  };

  if (isLoading) return <aside className="server-rail" aria-label="社区"><Spinner /></aside>;

  return (
    <aside className="server-rail" aria-label="社区">
      <button
        className={`server-button home${!serverId ? ' active' : ''}`}
        type="button"
        aria-label="好友与私聊"
        onClick={handleHome}
      >
        <Server size={22} />
      </button>

      <div className="rail-divider" />

      <div className="server-list">
        {servers && servers.length > 0 ? (
          servers.map((s) => (
            <button
              key={s.server_id}
              className={`server-button${s.server_id === serverId ? ' active' : ''}`}
              type="button"
              aria-label={s.name}
              title={s.name}
              onClick={() => handleServerClick(s.server_id)}
            >
              <span className="server-initial">{s.name.slice(0, 1).toUpperCase()}</span>
            </button>
          ))
        ) : (
          <p className="server-empty">加入社区后在此显示</p>
        )}
      </div>

      <div className="rail-actions">
        <button
          className="server-button action"
          type="button"
          aria-label="创建社区"
          title="创建社区"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus size={20} />
        </button>
        <button
          className="server-button action"
          type="button"
          aria-label="加入社区"
          title="加入社区"
          onClick={() => setShowJoin(!showJoin)}
        >
          <LogIn size={16} />
        </button>
      </div>

      {showCreate && (
        <div className="rail-modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="rail-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h4>创建社区</h4>
            <input
              className="form-input"
              type="text"
              placeholder="社区名称"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              maxLength={80}
              autoFocus
            />
            <button className="button-primary" type="submit" disabled={createServer.isPending || !serverName.trim()}>
              {createServer.isPending ? '创建中...' : '创建'}
            </button>
          </form>
        </div>
      )}

      {showJoin && (
        <div className="rail-modal-overlay" onClick={() => setShowJoin(false)}>
          <form className="rail-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleJoin}>
            <h4>加入社区</h4>
            <input
              className="form-input"
              type="text"
              placeholder="输入邀请码"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              maxLength={32}
              autoFocus
            />
            <button className="button-primary" type="submit" disabled={joinServer.isPending || !inviteCode.trim()}>
              {joinServer.isPending ? '加入中...' : '加入'}
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
