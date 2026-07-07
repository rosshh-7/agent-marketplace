import React, { useEffect, useRef, useState } from 'react';

export interface ChatDisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatWindowProps {
  messages: ChatDisplayMessage[];
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Real chat UI for the hire/requirement-gathering flow — backed by the
 * backend's chat proxy (POST /api/jobs/:jobId/chat -> req-agent), not a
 * static form. See PLATFORM_CONTRACT.md §4/§9.
 */
export default function ChatWindow({ messages, onSend, disabled, placeholder }: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || disabled || isSending) return;
    setIsSending(true);
    setDraft('');
    try {
      await onSend(text);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble chat-bubble-${m.role}`}>
            <div className="chat-bubble-role">{m.role === 'user' ? 'You' : 'Agent'}</div>
            <div className="chat-bubble-content">{m.content}</div>
          </div>
        ))}
        {isSending ? (
          <div className="chat-bubble chat-bubble-assistant" aria-label="Agent is typing">
            <div className="chat-bubble-role">Agent</div>
            <div className="typing-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder ?? 'Type your reply…'}
          disabled={disabled || isSending}
        />
        <button type="submit" disabled={disabled || isSending || !draft.trim()}>
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
