import { useEffect } from 'react';
import { Headphones, Mic, MicOff, Phone, Volume2, VolumeX } from 'lucide-react';
import { useParams } from 'react-router-dom';

import * as socket from '../../shared/api/socket-client';
import { EmptyState } from '../../shared/components/EmptyState';
import { Spinner } from '../../shared/components/Spinner';
import { useAuthStore } from '../../shared/state/use-auth-store';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
import {
  useJoinVoiceChannel,
  useUpdateVoiceState,
  useVoiceSessions,
} from '../voice/use-voice-queries';
import { useServerDetail } from './use-servers-queries';

export function ServerVoicePage() {
  const { channelId, serverId } = useParams<{ channelId: string; serverId: string }>();
  const currentUserId = useAuthStore((state) => state.currentUser?.user_id);
  const { activeVoiceSession } = useWorkspaceStore();
  const { data: server } = useServerDetail(serverId ?? null);
  const { data: sessions, isLoading } = useVoiceSessions(channelId ?? null);
  const joinVoice = useJoinVoiceChannel(channelId ?? '');
  const updateState = useUpdateVoiceState();
  const channel = server?.channels.find((item) => item.channel_id === channelId);
  const currentSession =
    activeVoiceSession?.channel_id === channelId
      ? activeVoiceSession
      : sessions?.find((session) => session.user_id === currentUserId) ?? null;

  useEffect(() => {
    if (!channelId) {
      return undefined;
    }

    socket.subscribe('voice', channelId);

    return () => {
      socket.unsubscribe('voice', channelId);
    };
  }, [channelId]);

  if (!channelId) {
    return (
      <EmptyState
        icon={Volume2}
        title="语音频道"
        description="请选择一个语音频道"
      />
    );
  }

  const toggleMute = () => {
    if (!currentSession) return;
    updateState.mutate({
      input: { mute_state: !currentSession.mute_state },
      sessionId: currentSession.session_id,
    });
  };

  const toggleDeafen = () => {
    if (!currentSession) return;
    updateState.mutate({
      input: { deafen_state: !currentSession.deafen_state },
      sessionId: currentSession.session_id,
    });
  };

  return (
    <div className="voice-page">
      <header className="voice-page-header">
        <div>
          <span className="voice-kicker">Voice</span>
          <h2>{channel?.name ?? '语音频道'}</h2>
        </div>
        <button
          className="button-primary"
          type="button"
          disabled={joinVoice.isPending || !!currentSession}
          onClick={() =>
            joinVoice.mutate({
              initial_deafen_state: false,
              initial_mute_state: false,
            })
          }
        >
          <Phone size={16} />
          {currentSession ? '已加入' : joinVoice.isPending ? '加入中...' : '加入语音'}
        </button>
      </header>

      {currentSession && (
        <div className="voice-controls">
          <button className="icon-button" type="button" onClick={toggleMute} title="切换静音">
            {currentSession.mute_state ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button className="icon-button" type="button" onClick={toggleDeafen} title="切换闭麦">
            {currentSession.deafen_state ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <span>{currentSession.connection_status}</span>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState
          icon={Volume2}
          title="暂无成员"
          description="加入后你的语音状态会显示在这里"
        />
      ) : (
        <ul className="voice-member-list">
          {sessions.map((session) => (
            <li key={session.session_id} className="voice-member">
              <div className="voice-member-avatar">
                {session.member.nickname.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{session.member.nickname}</strong>
                <span>{session.connection_status}</span>
              </div>
              <div className="voice-member-icons">
                {session.mute_state && <MicOff size={15} />}
                {session.deafen_state && <VolumeX size={15} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
