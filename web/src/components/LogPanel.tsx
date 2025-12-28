/**
 * Log Panel Component
 * Shows all events with timestamps
 */

import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useCallback } from 'react';
import { bobiStore } from '../store/bobiStore';

export const LogPanel = observer(function LogPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    if (scrollRef.current && autoScrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [bobiStore.logs.length]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // If scrolled near bottom, enable auto-scroll
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  }, []);

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    const time = d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
  };

  const getLevelClass = (level: string): string => {
    switch (level.toUpperCase()) {
      case 'ERROR': return 'log-error';
      case 'WARN': return 'log-warn';
      case 'INFO': return 'log-info';
      case 'DEBUG': return 'log-debug';
      default: return '';
    }
  };

  const handleClear = useCallback(() => {
    bobiStore.clearLogs();
  }, []);

  return (
    <div className="log-panel">
      <div className="log-header">
        <h3>📋 事件日志</h3>
        <button className="btn btn-small" onClick={handleClear}>
          清空
        </button>
      </div>

      <div 
        className="log-messages" 
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {bobiStore.logs.length === 0 && (
          <div className="log-empty">暂无日志</div>
        )}

        {bobiStore.logs.map((log, idx) => (
          <div key={idx} className={`log-entry ${getLevelClass(log.level)}`}>
            <span className="log-time">{formatTime(log.ts)}</span>
            <span className="log-level">[{log.level}]</span>
            <span className="log-category">[{log.category}]</span>
            <span className="log-message">{log.message}</span>
            {log.data !== undefined && (
              <span className="log-data">
                {typeof log.data === 'object' ? JSON.stringify(log.data) : String(log.data)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
