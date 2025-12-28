/**
 * Log Panel Component
 * Displays system events and logs
 */

import { observer } from 'mobx-react-lite';
import { useRef, useEffect, useState } from 'react';
import { bobiStore } from '../../core/store';

export const LogPanel = observer(function LogPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const [, setTick] = useState(0);

  // Force re-render when logs change
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [bobiStore.logs.length]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  const clearLogs = () => {
    bobiStore.clearLogs();
  };

  return (
    <div className="log-panel">
      <div className="log-header">
        <h3>📋 日志</h3>
        <button className="btn btn-small" onClick={clearLogs}>清空</button>
      </div>
      <div 
        className="log-container" 
        ref={containerRef}
        onScroll={handleScroll}
      >
        {bobiStore.logs.map((log, i) => (
          <div key={i} className={`log-entry level-${log.level}`}>
            <span className="log-time">{formatTime(log.timestamp)}</span>
            <span className="log-level">[{log.level.toUpperCase()}]</span>
            <span className="log-message">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
