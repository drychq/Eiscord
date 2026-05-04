import { Headphones, Mic, MicOff, PhoneOff, VolumeX } from 'lucide-react';
import { useWorkspaceStore } from '../state/use-workspace-store';
import {
  useLeaveVoiceSession,
  useUpdateVoiceState,
} from '../../features/voice/use-voice-queries';

export function VoiceStrip() {
  const { activeVoiceChannelId, activeVoiceSession, setActiveVoiceChannelId } = useWorkspaceStore();
  const leaveVoice = useLeaveVoiceSession();
  const updateVoice = useUpdateVoiceState();

  if (!activeVoiceChannelId) return null;

  const sessionId = activeVoiceSession?.session_id;

  return (
    <div className="voice-strip">
      <Headphones size={18} />
      <div>
        <strong>语音已连接</strong>
        <span>{activeVoiceSession?.connection_status ?? 'connected'}</span>
      </div>
      {activeVoiceSession && (
        <div className="voice-strip-controls">
          <button
            className="icon-button"
            type="button"
            aria-label="切换静音"
            onClick={() =>
              sessionId &&
              updateVoice.mutate({
                input: { mute_state: !activeVoiceSession.mute_state },
                sessionId,
              })
            }
          >
            {activeVoiceSession.mute_state ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="切换闭麦"
            onClick={() =>
              sessionId &&
              updateVoice.mutate({
                input: { deafen_state: !activeVoiceSession.deafen_state },
                sessionId,
              })
            }
          >
            {activeVoiceSession.deafen_state ? <VolumeX size={15} /> : <Headphones size={15} />}
          </button>
        </div>
      )}
      <button
        className="icon-button"
        type="button"
        aria-label="退出语音"
        onClick={() => {
          if (sessionId) {
            leaveVoice.mutate(sessionId);
          } else {
            setActiveVoiceChannelId(null);
          }
        }}
        style={{ marginLeft: 'auto', background: 'transparent', borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}
      >
        <PhoneOff size={16} />
      </button>
    </div>
  );
}
