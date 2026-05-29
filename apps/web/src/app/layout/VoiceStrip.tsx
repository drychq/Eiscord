import { Headphones, Mic, MicOff, PhoneOff, VolumeX } from 'lucide-react';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
import {
  useLeaveVoiceSession,
  useUpdateVoiceState,
} from '../../features/voice/use-voice-queries';
import { voiceClient } from '../../features/voice/voice-client';

export function VoiceStrip() {
  const { activeVoiceChannelId, activeVoiceSession, setActiveVoiceChannelId } = useWorkspaceStore();
  const leaveVoice = useLeaveVoiceSession();
  const updateVoice = useUpdateVoiceState();

  if (!activeVoiceChannelId) return null;

  const sessionId = activeVoiceSession?.session_id;

  const handleMuteToggle = () => {
    if (!sessionId || !activeVoiceSession) return;
    const nextMuted = !activeVoiceSession.mute_state;
    voiceClient.setMuted(nextMuted);
    updateVoice.mutate({
      input: { mute_state: nextMuted },
      sessionId,
    });
  };

  const handleDeafenToggle = () => {
    if (!sessionId || !activeVoiceSession) return;
    const nextDeafened = !activeVoiceSession.deafen_state;
    voiceClient.setDeafened(nextDeafened);
    updateVoice.mutate({
      input: { deafen_state: nextDeafened },
      sessionId,
    });
  };

  const handleLeave = () => {
    void voiceClient.stop('manual_leave');
    if (sessionId) {
      leaveVoice.mutate(sessionId);
    } else {
      setActiveVoiceChannelId(null);
    }
  };

  return (
    <div className="voice-strip">
      <Headphones size={18} />
      <div>
        <strong>语音已连接</strong>
        <span>{activeVoiceSession?.connection_status ?? 'CONNECTED'}</span>
      </div>
      {activeVoiceSession && (
        <div className="voice-strip-controls">
          <button
            className="icon-button"
            type="button"
            aria-label="切换静音"
            onClick={handleMuteToggle}
          >
            {activeVoiceSession.mute_state ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="切换闭麦"
            onClick={handleDeafenToggle}
          >
            {activeVoiceSession.deafen_state ? <VolumeX size={15} /> : <Headphones size={15} />}
          </button>
        </div>
      )}
      <button
        className="icon-button"
        type="button"
        aria-label="退出语音"
        onClick={handleLeave}
        style={{ marginLeft: 'auto', background: 'transparent', borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}
      >
        <PhoneOff size={16} />
      </button>
    </div>
  );
}
