import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { Hash, UserPlus, Volume2, Settings } from 'lucide-react';
import { useWorkspaceStore } from '../state/use-workspace-store';
import { useServerDetail } from '../../features/servers/use-servers-queries';
import { useDmConversations } from '../../features/friends/use-friends-queries';
import { Spinner } from './Spinner';

export function SidePanel() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const { isServerSettingsOpen, setServerSettingsOpen, setActiveChannelId } = useWorkspaceStore();
  const { data: server, isLoading: serverLoading } = useServerDetail(serverId ?? null);
  const { data: dms, isLoading: dmsLoading } = useDmConversations();

  if (serverId) {
    if (serverLoading) return <aside className="channel-panel" aria-label="频道列表"><Spinner /></aside>;

    const textChannels = server?.channels.filter((c) => c.type === 'text') ?? [];
    const voiceChannels = server?.channels.filter((c) => c.type === 'voice') ?? [];

    return (
      <aside className="channel-panel" aria-label="频道与私聊列表">
        <div className="panel-header">
          <div>
            <span className="eyebrow">社区</span>
            <h1>{server?.name ?? `社区 #${serverId.slice(0, 8)}`}</h1>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="社区设置"
            onClick={() => setServerSettingsOpen(!isServerSettingsOpen)}
          >
            <Settings size={18} />
          </button>
        </div>

        <section className="channel-section">
          <div className="section-title">
            <Hash size={14} />
            <span>文本频道</span>
          </div>
          {textChannels.length === 0 ? (
            <div className="empty-section">暂无频道</div>
          ) : (
            textChannels.map((ch) => (
              <NavLink
                key={ch.channel_id}
                to={`/app/servers/${serverId}/channels/${ch.channel_id}`}
                className="channel-link"
                onClick={() => setActiveChannelId(ch.channel_id)}
              >
                <Hash size={16} />
                <span>{ch.name}</span>
              </NavLink>
            ))
          )}
        </section>

        <section className="channel-section">
          <div className="section-title">
            <Volume2 size={14} />
            <span>语音频道</span>
          </div>
          {voiceChannels.length === 0 ? (
            <div className="empty-section">暂无频道</div>
          ) : (
            voiceChannels.map((ch) => (
              <NavLink
                key={ch.channel_id}
                to={`/app/servers/${serverId}/voice/${ch.channel_id}`}
                className="channel-link"
              >
                <Volume2 size={16} />
                <span>{ch.name}</span>
              </NavLink>
            ))
          )}
        </section>
      </aside>
    );
  }

  if (dmsLoading) return <aside className="channel-panel" aria-label="私聊列表"><Spinner /></aside>;

  return (
    <aside className="channel-panel" aria-label="频道与私聊列表">
      <div className="panel-header">
        <div>
          <span className="eyebrow">私聊</span>
          <h1>好友与私聊</h1>
        </div>
        <NavLink to="/app/friends" className="icon-button" aria-label="好友列表">
          <UserPlus size={18} />
        </NavLink>
      </div>

      <section className="channel-section">
        <div className="section-title">
          <span>私聊会话</span>
        </div>
        {!dms || dms.length === 0 ? (
          <div className="empty-section">暂无会话</div>
        ) : (
          dms.map((dm) => (
            <button
              key={dm.conversation_id}
              className="channel-link"
              type="button"
              onClick={() => navigate(`/app/dm/${dm.conversation_id}`)}
            >
              <div className="dm-avatar" aria-hidden>
                {dm.friend.nickname.slice(0, 1).toUpperCase()}
              </div>
              <span>{dm.friend.nickname}</span>
            </button>
          ))
        )}
      </section>
    </aside>
  );
}
