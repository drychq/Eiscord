import { Mic2 } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function VoicePage() {
  return (
    <EmptyState
      icon={Mic2}
      title="语音状态"
      description="语音状态同步即将在 M5 上线"
    />
  );
}
