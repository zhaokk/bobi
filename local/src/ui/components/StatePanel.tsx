/**
 * State Panel Component
 * Shows current state machine state, timers, connection status
 */

import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { bobiStore } from '../../core/store';
import { useAudioInput } from '../hooks/useAudioInput';

export const StatePanel = observer(function StatePanel() {
  // Force re-render every second for timers
  const [, setTick] = useState(0);
  const { startCapture, stopCapture } = useAudioInput();
  
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Start audio capture when awake (sends audio to LLM)
  useEffect(() => {
    if (bobiStore.isAwake && !bobiStore.micActive) {
      startCapture();
    } else if (!bobiStore.isAwake && bobiStore.micActive) {
      stopCapture();
    }
  }, [bobiStore.isAwake, bobiStore.micActive, startCapture, stopCapture]);

  const formatMs = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Generate bars for mic level visualization
  const getMicBars = () => {
    const level = bobiStore.micLevel;
    const barCount = 10;
    const activeCount = Math.round((level / 100) * barCount);
    return Array.from({ length: barCount }, (_, i) => i < activeCount);
  };

  return (
    <div className="state-panel">
      <h3>📊 状态面板</h3>
      
      <div className="state-grid">
        <div className="state-item">
          <span className="label">状态机</span>
          <span className="value">
            {bobiStore.stateEmoji} {bobiStore.state}
          </span>
        </div>

        <div className="state-item">
          <span className="label">Realtime API</span>
          <span className={`value ${bobiStore.realtimeStatus === 'connected' ? 'connected' : bobiStore.realtimeStatus === 'connecting' ? 'connecting' : 'disconnected'}`}>
            {bobiStore.realtimeStatus === 'connected' ? '🟢 已连接' : 
             bobiStore.realtimeStatus === 'connecting' ? '🟡 连接中...' : 
             bobiStore.realtimeStatus === 'error' ? '🔴 错误' : '⚪ 断开'}
          </span>
        </div>

        {/* Microphone Level */}
        <div className="state-item mic-level-item">
          <span className="label">🎤 麦克风</span>
          <div className="mic-level-container">
            {bobiStore.micActive ? (
              <>
                <div className="mic-bars">
                  {getMicBars().map((active, i) => (
                    <div 
                      key={i} 
                      className={`mic-bar ${active ? 'active' : ''}`}
                      style={{ 
                        backgroundColor: active 
                          ? (i < 6 ? '#4caf50' : i < 8 ? '#ff9800' : '#f44336')
                          : 'rgba(255,255,255,0.2)'
                      }}
                    />
                  ))}
                </div>
                <span className="mic-level-text">{Math.round(bobiStore.micLevel)}%</span>
              </>
            ) : (
              <span className="value disconnected">⚪ 未激活</span>
            )}
          </div>
        </div>

        {bobiStore.realtimeModel && (
          <div className="state-item">
            <span className="label">模型</span>
            <span className="value model-name">
              {bobiStore.realtimeModel}
            </span>
          </div>
        )}

        <div className="state-item">
          <span className="label">DVR录制</span>
          <span className="value">
            {bobiStore.dvrRecording ? '🔴 录制中' : '⚪ 停止'}
          </span>
        </div>

        {bobiStore.isAwake && (
          <>
            <div className="state-item">
              <span className="label">唤醒剩余</span>
              <span className="value timer">
                {formatMs(bobiStore.awakeRemainingMs)}
              </span>
            </div>

            <div className="state-item">
              <span className="label">对话时长</span>
              <span className="value timer">
                {formatMs(bobiStore.dialogDurationMs)}
              </span>
            </div>
          </>
        )}
      </div>

      {bobiStore.sessionId && (
        <div className="session-id">
          Session: {bobiStore.sessionId.slice(0, 20)}...
        </div>
      )}
    </div>
  );
});
