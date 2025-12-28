/**
 * Conversation Panel Component
 * Displays chat history with streaming support
 */

import { observer } from 'mobx-react-lite';
import { useRef, useEffect } from 'react';
import { bobiStore } from '../../core/store';

export const ConversationPanel = observer(function ConversationPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [bobiStore.conversation.length, bobiStore.streamingResponse]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  return (
    <div className="conversation-panel">
      <h3>💬 对话</h3>
      <div 
        className="messages-container" 
        ref={containerRef}
        onScroll={handleScroll}
      >
        {bobiStore.conversation.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <span className="role-label">
              {msg.role === 'user' ? '👤' : '🤖'}
            </span>
            <span className="content">{msg.content}</span>
          </div>
        ))}
        
        {bobiStore.streamingResponse && (
          <div className="message assistant streaming">
            <span className="role-label">🤖</span>
            <span className="content">
              {bobiStore.streamingResponse}
              <span className="cursor">▋</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
