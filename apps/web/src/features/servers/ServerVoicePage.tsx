import { useEffect, useRef, useState } from 'react';
import { Headphones, Mic, MicOff, Phone, Volume2, VolumeX } from 'lucide-react';
import { useParams } from 'react-router-dom';
import type { VoiceActiveProducer } from '@eiscord/shared';

import * as socket from '../../shared/api/socket-client';
import { EmptyState } from '../../shared/components/EmptyState';
import { Spinner } from '../../shared/components/Spinner';
import { useAuthStore } from '../../shared/state/use-auth-store';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
import {
  useJoinVoiceChannel,
  useLeaveVoiceSession,
  useUpdateVoiceState,
  useVoiceSessions,
} from '../voice/use-voice-queries';
import { voiceClient, type VoiceClientStatus } from '../voice/voice-client';
import { useServerDetail } from './use-servers-queries';

const STATUS_LABEL: Record<VoiceClientStatus, string> = {
  idle: '未连接',
  negotiating: '协商中',
  connected: '已连接',
  reconnecting: '重连中',
  failed: '协商失败',
};

export function ServerVoicePage() {
  const { channelId, serverId } = useParams<{ channelId: string; serverId: string }>();
  const currentUserId = useAuthStore((state) => state.currentUser?.user_id);
  const { activeVoiceSession, pendingVoiceMedia, setPendingVoiceMedia } = useWorkspaceStore();
  const { data: server } = useServerDetail(serverId ?? null);
  const { data: sessions, isLoading } = useVoiceSessions(channelId ?? null);
  const joinVoice = useJoinVoiceChannel(channelId ?? '');
  const leaveVoice = useLeaveVoiceSession();
  const updateState = useUpdateVoiceState();
  const channel = server?.channels.find((item) => item.channel_id === channelId);
  const listedCurrentSession = sessions?.find((session) => session.user_id === currentUserId) ?? null;
  const currentSession =
    listedCurrentSession ?? (activeVoiceSession?.channel_id === channelId ? activeVoiceSession : null);

  const [voiceStatus, setVoiceStatus] = useState<VoiceClientStatus>(voiceClient.status());
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());

  // realtime room subscription
  useEffect(() => {
    if (!channelId) {
      return undefined;
    }

    socket.subscribe('voice', channelId);

    return () => {
      socket.unsubscribe('voice', channelId);
    };
  }, [channelId]);

  // bind voice-client listeners (status, active speaker, remote tracks)
  useEffect(() => {
    const unregisters = [
      voiceClient.onStatusChange((next) => setVoiceStatus(next)),
      voiceClient.onActiveSpeaker((userId) => setActiveSpeakerId(userId)),
      voiceClient.onRemoteTrack((userId, stream) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          if (stream) {
            next.set(userId, stream);
          } else {
            next.delete(userId);
          }
          return next;
        });
      }),
      voiceClient.onWorkerDied(() => {
        // mediasoup worker died — backend ended our session; auto re-join to a fresh one (AC-E8)
        if (channelId) {
          joinVoice.mutate({
            initial_deafen_state: false,
            initial_mute_state: false,
          });
        }
      }),
    ];
    setVoiceStatus(voiceClient.status());

    return () => unregisters.forEach((fn) => fn());
  }, [channelId, joinVoice]);

  // start voice-client when session + media are ready
  useEffect(() => {
    if (!currentSession || !pendingVoiceMedia || !currentUserId) return;
    if (currentSession.user_id && currentSession.user_id !== currentUserId) return;
    if (voiceClient.isStarted()) return;

    const media = pendingVoiceMedia;
    setPendingVoiceMedia(null);

    voiceClient
      .start({
        sessionId: currentSession.session_id,
        channelId: currentSession.channel_id,
        userId: currentUserId,
        media,
        initialMuted: currentSession.mute_state,
      })
      .catch((error) => {
        console.error('voice-client start failed:', error);
      });
  }, [currentSession, pendingVoiceMedia, setPendingVoiceMedia, currentUserId]);

  // Reconcile active Producers from the canonical session list. This backs up the realtime
  // broadcast path so a listener that joins late still discovers already-producing peers.
  useEffect(() => {
    if (!channelId || !currentUserId || !sessions || !voiceClient.isStarted()) return;

    const activeProducers: VoiceActiveProducer[] = sessions.flatMap((session) =>
      session.producer_id
        ? [
            {
              channel_id: session.channel_id,
              kind: 'audio' as const,
              paused: session.mute_state,
              producer_id: session.producer_id,
              user_id: session.user_id,
            },
          ]
        : [],
    );

    voiceClient.syncRemoteProducers(activeProducers);
  }, [channelId, currentUserId, sessions]);

  // stop voice-client when leaving the page or after session ends
  useEffect(() => {
    if (!channelId) {
      void voiceClient.stop('navigate-away');
    }
    return () => {
      if (!useWorkspaceStore.getState().activeVoiceSession) {
        void voiceClient.stop('component-unmount');
      }
    };
  }, [channelId]);

  // wire MediaStream → <audio>
  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      const el = audioRefs.current.get(userId);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => {
          // autoplay may fail if no user gesture; ignore — Playwright launches with autoplay-policy=no-user-gesture-required
        });
      }
    }
  }, [remoteStreams]);

  // mirror deafen state to remote audio elements
  useEffect(() => {
    const muted = !!currentSession?.deafen_state;
    for (const el of audioRefs.current.values()) {
      el.muted = muted;
    }
  }, [currentSession?.deafen_state, remoteStreams]);

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
    const nextMuted = !currentSession.mute_state;
    voiceClient.setMuted(nextMuted);
    updateState.mutate({
      input: { mute_state: nextMuted },
      sessionId: currentSession.session_id,
    });
  };

  const toggleDeafen = () => {
    if (!currentSession) return;
    const nextDeafened = !currentSession.deafen_state;
    voiceClient.setDeafened(nextDeafened);
    updateState.mutate({
      input: { deafen_state: nextDeafened },
      sessionId: currentSession.session_id,
    });
  };

  const handleLeave = () => {
    if (!currentSession) return;
    void voiceClient.stop('manual_leave');
    leaveVoice.mutate(currentSession.session_id);
  };

  return (
    <div className="voice-page">
      <header className="voice-page-header">
        <div>
          <span className="voice-kicker">Voice</span>
          <h2>{channel?.name ?? '语音频道'}</h2>
        </div>
        {currentSession ? (
          <button
            className="button-primary"
            type="button"
            onClick={handleLeave}
            data-testid="voice-leave"
          >
            <Phone size={16} />
            离开语音
          </button>
        ) : (
          <button
            className="button-primary"
            type="button"
            disabled={joinVoice.isPending}
            onClick={() =>
              joinVoice.mutate({
                initial_deafen_state: false,
                initial_mute_state: false,
              })
            }
            data-testid="voice-join"
          >
            <Phone size={16} />
            {joinVoice.isPending ? '加入中...' : '加入语音'}
          </button>
        )}
      </header>

      {currentSession && (
        <div className="voice-controls">
          <button
            className="icon-button"
            type="button"
            onClick={toggleMute}
            title="切换静音"
            data-testid="voice-mute"
            aria-pressed={currentSession.mute_state}
          >
            {currentSession.mute_state ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={toggleDeafen}
            title="切换闭麦"
            data-testid="voice-deafen"
            aria-pressed={currentSession.deafen_state}
          >
            {currentSession.deafen_state ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <span data-testid="voice-status" data-voice-status={voiceStatus}>
            {STATUS_LABEL[voiceStatus]}（{currentSession.connection_status}）
          </span>
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
        <ul className="voice-member-list" data-testid="voice-member-list">
          {sessions.map((session) => (
            <li
              key={session.session_id}
              className="voice-member"
              data-user-id={session.user_id}
              data-active-speaker={activeSpeakerId === session.user_id ? 'true' : 'false'}
            >
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

      <div className="voice-remote-audio" aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        {Array.from(remoteStreams.keys()).map((userId) => (
          <audio
            key={userId}
            data-user-id={userId}
            data-testid={`voice-remote-audio-${userId}`}
            autoPlay
            playsInline
            ref={(el) => {
              if (el) {
                audioRefs.current.set(userId, el);
              } else {
                audioRefs.current.delete(userId);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
