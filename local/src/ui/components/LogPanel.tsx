/**
 * Log Panel Component
 * Displays system events and logs
 */

import { observer } from 'mobx-react-lite';
import { useRef, useEffect, useState } from 'react';
import { bobiStore } from '../../core/store';
import type { LogLevel } from '../../core/types';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOG_FILTER_KEY = 'bobi-log-filter-level';

export const LogPanel = observer(function LogPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const [, setTick] = useState(0);
  const [filterLevel, setFilterLevel] = useState<LogLevel>(() => {
    const saved = localStorage.getItem(LOG_FILTER_KEY);
    return (saved as LogLevel) || 'INFO';
  });

  // Save filter level to localStorage
  const handleFilterChange = (level: LogLevel) => {
    setFilterLevel(level);
    localStorage.setItem(LOG_FILTER_KEY, level);
  };

  // Filter logs based on selected level
  const filteredLogs = bobiStore.logs.filter(
    log => LOG_LEVEL_PRIORITY[log.level] >= LOG_LEVEL_PRIORITY[filterLevel]
  );

  // Force re-render when logs change
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs.length]);

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

  const downloadLogs = () => {
    bobiStore.downloadLogs();
  };

  return (
    <div className="log-panel">
      <div className="log-header">
        <h3>📋 日志</h3>
        <div className="log-controls">
          <select 
            className="log-filter-select"
            value={filterLevel}
            onChange={(e) => handleFilterChange(e.target.value as LogLevel)}
          >
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
          <button className="btn btn-small" onClick={downloadLogs} title="下载日志">📥</button>
          <button className="btn btn-small" onClick={clearLogs}>清空</button>
        </div>
      </div>
      <div 
        className="log-container" 
        ref={containerRef}
        onScroll={handleScroll}
      >
        {filteredLogs.map((log, i) => (
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
