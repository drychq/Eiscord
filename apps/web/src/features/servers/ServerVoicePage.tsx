import { Volume2 } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function ServerVoicePage() {
  return (
    <EmptyState
      icon={Volume2}
      title="语音频道"
      description="语音功能即将在 M5 上线"
    />
  );
}
