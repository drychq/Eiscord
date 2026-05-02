import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Bell,
  Hash,
  MessageCircle,
  Mic2,
  Plus,
  Search,
  Server,
  Settings,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';
import { useState } from 'react';

import { ChannelType, PresenceStatus } from '@eiscord/shared';

import { getPublicClientConfig } from '../shared/api/client-config';
import { useWorkspaceStore } from '../shared/state/use-workspace-store';

const servers = [
  { id: 'home', initials: 'EC', label: 'Eiscord' },
  { id: 'course', initials: 'CS', label: '课程讨论' },
  { id: 'team', initials: 'TM', label: '项目组' },
];

const channels = [
  { id: 'general', name: 'general', type: ChannelType.Text },
  { id: 'dev-plan', name: 'dev-plan', type: ChannelType.Text },
  { id: 'voice-room', name: 'voice-room', type: ChannelType.Voice },
];

const members = [
  { id: 'alice', name: 'Alice', status: PresenceStatus.Online, role: 'Owner' },
  { id: 'bob', name: 'Bob', status: PresenceStatus.Idle, role: 'Moderator' },
  { id: 'carol', name: 'Carol', status: PresenceStatus.Offline, role: 'Member' },
];

const messages = [
  {
    id: 'm1',
    author: 'Alice',
    time: '09:24',
    text: '工程底座已经开始落地，先固定 workspace 和共享契约。',
  },
  {
    id: 'm2',
    author: 'Bob',
    time: '09:31',
    text: 'API 和 Web 会先接上同一套类型，后续业务模块再逐步填充。',
  },
  {
    id: 'm3',
    author: 'Carol',
    time: '09:38',
    text: 'Docker 依赖服务按 PostgreSQL、Redis、MinIO 的顺序启动。',
  },
];

export function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceShell />
    </QueryClientProvider>
  );
}

function WorkspaceShell() {
  const { currentChannelId, currentServerId, setCurrentChannelId, setCurrentServerId } =
    useWorkspaceStore();
  const activeChannel = channels.find((channel) => channel.id === currentChannelId) ?? channels[0];
  const config = getPublicClientConfig();

  return (
    <div className="workspace">
      <aside className="server-rail" aria-label="社区">
        <button className="server-button home" type="button" aria-label="Eiscord">
          <Server size={22} />
        </button>
        <div className="rail-divider" />
        {servers.map((server) => (
          <button
            className={server.id === currentServerId ? 'server-button active' : 'server-button'}
            key={server.id}
            type="button"
            aria-label={server.label}
            onClick={() => setCurrentServerId(server.id)}
          >
            {server.initials}
          </button>
        ))}
        <button className="server-button action" type="button" aria-label="创建社区">
          <Plus size={20} />
        </button>
      </aside>

      <aside className="channel-panel" aria-label="频道">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Eiscord</span>
            <h1>课程讨论</h1>
          </div>
          <button className="icon-button" type="button" aria-label="社区设置">
            <Settings size={18} />
          </button>
        </div>

        <section className="channel-section">
          <div className="section-title">
            <span>文本频道</span>
            <button className="tiny-button" type="button" aria-label="新建文本频道">
              <Plus size={14} />
            </button>
          </div>
          {channels
            .filter((channel) => channel.type === ChannelType.Text)
            .map((channel) => (
              <button
                className={channel.id === activeChannel.id ? 'channel-row active' : 'channel-row'}
                key={channel.id}
                type="button"
                onClick={() => setCurrentChannelId(channel.id)}
              >
                <Hash size={16} />
                <span>{channel.name}</span>
              </button>
            ))}
        </section>

        <section className="channel-section">
          <div className="section-title">
            <span>语音频道</span>
            <button className="tiny-button" type="button" aria-label="新建语音频道">
              <Plus size={14} />
            </button>
          </div>
          {channels
            .filter((channel) => channel.type === ChannelType.Voice)
            .map((channel) => (
              <button className="channel-row" key={channel.id} type="button">
                <Volume2 size={16} />
                <span>{channel.name}</span>
              </button>
            ))}
        </section>

        <div className="voice-strip">
          <Mic2 size={18} />
          <div>
            <strong>voice-room</strong>
            <span>connected</span>
          </div>
        </div>
      </aside>

      <main className="message-panel">
        <header className="message-header">
          <div className="channel-heading">
            <Hash size={20} />
            <strong>{activeChannel.name}</strong>
          </div>
          <div className="header-actions">
            <button className="icon-button" type="button" aria-label="好友">
              <UserPlus size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="通知">
              <Bell size={18} />
            </button>
            <button className="search-button" type="button" aria-label="搜索">
              <Search size={16} />
              <span>Search</span>
            </button>
          </div>
        </header>

        <section className="message-list" aria-label="消息">
          {messages.map((message) => (
            <article className="message-row" key={message.id}>
              <div className="avatar">{message.author.slice(0, 1)}</div>
              <div>
                <div className="message-meta">
                  <strong>{message.author}</strong>
                  <span>{message.time}</span>
                </div>
                <p>{message.text}</p>
              </div>
            </article>
          ))}
        </section>

        <form className="composer">
          <button className="icon-button" type="button" aria-label="添加附件">
            <Plus size={18} />
          </button>
          <input aria-label="发送消息" placeholder={`Message #${activeChannel.name}`} />
          <button className="send-button" type="submit">
            <MessageCircle size={17} />
            <span>Send</span>
          </button>
        </form>
      </main>

      <aside className="member-panel" aria-label="成员">
        <div className="member-header">
          <Users size={18} />
          <strong>Members</strong>
        </div>
        {members.map((member) => (
          <div className="member-row" key={member.id}>
            <span className={`presence ${member.status.toLowerCase()}`} />
            <div>
              <strong>{member.name}</strong>
              <span>{member.role}</span>
            </div>
          </div>
        ))}
        <div className="config-readout">
          <span>API</span>
          <strong>{config.apiBaseUrl.replace(/^https?:\/\//, '')}</strong>
        </div>
      </aside>
    </div>
  );
}
