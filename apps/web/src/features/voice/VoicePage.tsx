import { Mic2 } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function VoicePage() {
  return (
    <EmptyState
      icon={Mic2}
      title="语音状态"
      description="进入社区的语音频道即可加入多人音频对讲（mediasoup-client 已上线）"
    />
  );
}
