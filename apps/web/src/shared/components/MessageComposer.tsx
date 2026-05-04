import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

type MessageComposerProps = {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function MessageComposer({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}: MessageComposerProps) {
  const [content, setContent] = useState('');

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setContent('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={4000}
        aria-label="消息内容"
      />
      <button
        type="submit"
        className="send-button"
        disabled={disabled || !content.trim()}
        aria-label="发送"
      >
        <Send size={16} />
      </button>
    </form>
  );
}
