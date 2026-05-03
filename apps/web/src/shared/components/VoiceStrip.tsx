import { Mic2, PhoneOff } from 'lucide-react';
import { useWorkspaceStore } from '../state/use-workspace-store';

export function VoiceStrip() {
  const { activeVoiceChannelId, setActiveVoiceChannelId } = useWorkspaceStore();

  if (!activeVoiceChannelId) return null;

  return (
    <div className="voice-strip">
      <Mic2 size={18} />
      <div>
        <strong>voice-room</strong>
        <span>connected</span>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label="退出语音"
        onClick={() => setActiveVoiceChannelId(null)}
        style={{ marginLeft: 'auto', background: 'transparent', borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}
      >
        <PhoneOff size={16} />
      </button>
    </div>
  );
}
