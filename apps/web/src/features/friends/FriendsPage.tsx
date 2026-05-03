import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Clock, Users, MessageCircle, Check, X } from 'lucide-react';
import { Spinner } from '../../shared/components/Spinner';
import { FormField } from '../../shared/components/FormField';
import { useFriendsList, useDmConversations, useCreateFriendRequest, useAcceptFriendRequest, useRejectFriendRequest } from './use-friends-queries';
import type { FriendshipSummary, DirectConversationSummary } from './friends-api';

type Tab = 'friends' | 'pending' | 'add';

function FriendItem({ friendship, onDm }: { friendship: FriendshipSummary; onDm: (conversationId: string) => void }) {
  const { friend, conversation_id } = friendship;
  const statusLabel = friend.presence_status === 'ONLINE' ? '在线' : '离线';

  return (
    <li className="friend-item">
      <div className="friend-avatar" aria-hidden>
        {friend.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div className="friend-info">
        <span className="friend-name">{friend.nickname}</span>
        <span className="friend-username">@{friend.username}</span>
        <span className={`friend-status ${friend.presence_status.toLowerCase()}`}>{statusLabel}</span>
      </div>
      {conversation_id && (
        <button className="icon-button" type="button" aria-label={`与 ${friend.nickname} 私聊`} onClick={() => onDm(conversation_id!)}>
          <MessageCircle size={18} />
        </button>
      )}
    </li>
  );
}

function PendingItem({ friendship }: { friendship: FriendshipSummary }) {
  const accept = useAcceptFriendRequest();
  const reject = useRejectFriendRequest();
  const isIncoming = friendship.direction === 'incoming';

  return (
    <li className="friend-item">
      <div className="friend-avatar" aria-hidden>
        {friendship.friend.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div className="friend-info">
        <span className="friend-name">{friendship.friend.nickname}</span>
        <span className="friend-username">@{friendship.friend.username}</span>
        <span className="friend-status">{isIncoming ? '待你处理' : '等待对方'}</span>
      </div>
      {isIncoming && (
        <div className="friend-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="接受"
            disabled={accept.isPending}
            onClick={() => accept.mutate(friendship.friendship_id)}
          >
            <Check size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="拒绝"
            disabled={reject.isPending}
            onClick={() => reject.mutate(friendship.friendship_id)}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </li>
  );
}

function DmItem({ dm, onClick }: { dm: DirectConversationSummary; onClick: (id: string) => void }) {
  return (
    <li className="friend-item">
      <div className="friend-avatar" aria-hidden>
        {dm.friend.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div className="friend-info">
        <span className="friend-name">{dm.friend.nickname}</span>
        <span className="friend-username">@{dm.friend.username}</span>
      </div>
      <button className="icon-button" type="button" aria-label={`与 ${dm.friend.nickname} 私聊`} onClick={() => onClick(dm.conversation_id)}>
        <MessageCircle size={18} />
      </button>
    </li>
  );
}

export function FriendsPage() {
  const [tab, setTab] = useState<Tab>('friends');
  const [targetId, setTargetId] = useState('');
  const navigate = useNavigate();
  const { data: friendships, isLoading: friendsLoading } = useFriendsList();
  const { data: dms, isLoading: dmsLoading } = useDmConversations();
  const createRequest = useCreateFriendRequest();

  const accepted = friendships?.filter((f) => f.status === 'ACCEPTED') ?? [];
  const pending = friendships?.filter((f) => f.status === 'PENDING') ?? [];

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'friends', label: `好友 (${accepted.length})`, icon: Users },
    { key: 'pending', label: `待处理 (${pending.length})`, icon: Clock },
    { key: 'add', label: '添加好友', icon: UserPlus },
  ];

  if (friendsLoading || dmsLoading) return <Spinner />;

  return (
    <div className="friends-page">
      <div className="friends-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-button ${tab === t.key ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="friends-content" role="tabpanel">
        {tab === 'friends' && (
          <section aria-label="好友列表">
            {accepted.length === 0 ? (
              <p className="empty-section">暂无好友，去添加吧</p>
            ) : (
              <ul className="friend-list">
                {accepted.map((f) => (
                  <FriendItem key={f.friendship_id} friendship={f} onDm={(id) => navigate(`/app/dm/${id}`)} />
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'pending' && (
          <section aria-label="待处理申请">
            {pending.length === 0 ? (
              <p className="empty-section">没有待处理的好友申请</p>
            ) : (
              <ul className="friend-list">
                {pending.map((f) => (
                  <PendingItem key={f.friendship_id} friendship={f} />
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'add' && (
          <section aria-label="添加好友">
            <FormField label="目标用户 ID" error={createRequest.error ? '发送失败' : undefined}>
              <form
                className="add-friend-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (targetId.trim()) {
                    createRequest.mutate(targetId.trim());
                    setTargetId('');
                  }
                }}
              >
                <input
                  className="form-input"
                  type="text"
                  placeholder="输入用户 UUID"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  disabled={createRequest.isPending}
                />
                <button className="button-primary" type="submit" disabled={createRequest.isPending || !targetId.trim()}>
                  {createRequest.isPending ? '发送中...' : '发送申请'}
                </button>
              </form>
            </FormField>
          </section>
        )}

        {dms && dms.length > 0 && (
          <section aria-label="私聊会话" style={{ marginTop: 24 }}>
            <h3 className="section-title">私聊会话</h3>
            <ul className="friend-list">
              {dms.map((dm) => (
                <DmItem key={dm.conversation_id} dm={dm} onClick={(id) => navigate(`/app/dm/${id}`)} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
