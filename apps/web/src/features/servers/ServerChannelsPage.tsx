import { Hash } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function ServerChannelsPage() {
  return (
    <EmptyState
      icon={Hash}
      title="频道与消息"
      description="频道和消息功能即将在 M3 上线"
    />
  );
}
