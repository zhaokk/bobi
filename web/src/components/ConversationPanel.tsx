/**
 * Conversation Panel Component
 * Shows chat history with LLM
 */

import { observer } from 'mobx-react-lite';
import { useEffect, useRef } from 'react';
import { bobiStore } from '../store/bobiStore';

export const ConversationPanel = observer(function ConversationPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [bobiStore.conversation.length, bobiStore.currentResponse]);

  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="conversation-panel">
      <h3>💬 对话</h3>

      <div className="conversation-messages" ref={scrollRef}>
        {bobiStore.conversation.length === 0 && !bobiStore.currentResponse && (
          <div className="conversation-empty">
            <p>说 "Hi Bobi" 开始对话</p>
          </div>
        )}

        {bobiStore.conversation.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            <div className="message-header">
              <span className="message-role">
                {msg.role === 'user' ? '👤 用户' : '🤖 Bobi'}
              </span>
              <span className="message-time">{formatTime(msg.ts)}</span>
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {/* Current streaming response */}
        {bobiStore.currentResponse && (
          <div className="message message-assistant streaming">
            <div className="message-header">
              <span className="message-role">🤖 Bobi</span>
              <span className="message-time">正在输入...</span>
            </div>
            <div className="message-content">
              {bobiStore.currentResponse}
              <span className="typing-cursor">▊</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
