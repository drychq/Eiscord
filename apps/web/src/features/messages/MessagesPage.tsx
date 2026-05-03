import { MessageCircle } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function MessagesPage() {
  return (
    <EmptyState
      icon={MessageCircle}
      title="消息"
      description="消息功能即将在 M3 上线"
    />
  );
}
