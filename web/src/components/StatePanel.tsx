/**
 * State Panel Component
 * Shows current state machine state, timers, connection status
 */

import { observer } from 'mobx-react-lite';
import { bobiStore } from '../store/bobiStore';

export const StatePanel = observer(function StatePanel() {
  const formatMs = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
          <span className="label">WebSocket</span>
          <span className={`value ${bobiStore.wsConnected ? 'connected' : 'disconnected'}`}>
            {bobiStore.wsConnected ? '🟢 已连接' : '🔴 断开'}
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
