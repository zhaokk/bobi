/**
 * Camera Panel Component
 * Shows camera preview and handles frame capture
 */

import { observer } from 'mobx-react-lite';
import { useEffect, useRef } from 'react';
import { useCamera } from '../hooks/useCamera';
import { wsService } from '../services/websocket';
import { bobiStore } from '../store/bobiStore';

export const CameraPanel = observer(function CameraPanel() {
  const { videoRef, isReady, isStarting, error, autoStartAndCapture } = useCamera();
  const processingRef = useRef(false);

  // Auto-capture when requested by server - automatically starts camera if needed
  useEffect(() => {
    const request = bobiStore.pendingFrameRequest;
    if (!request || processingRef.current) return;

    processingRef.current = true;

    // Auto start camera and capture
    autoStartAndCapture(request.maxWidth, request.quality)
      .then((imageDataUrl) => {
        if (imageDataUrl) {
          wsService.sendFrame(request.requestId, request.camera, imageDataUrl);
        } else {
          wsService.sendFrameError(request.requestId, request.camera, 'Failed to capture frame');
        }
      })
      .catch((err) => {
        wsService.sendFrameError(request.requestId, request.camera, err.message || 'Camera error');
      })
      .finally(() => {
        processingRef.current = false;
      });
  }, [bobiStore.pendingFrameRequest, autoStartAndCapture]);

  return (
    <div className="camera-panel">
      <h3>📷 摄像头</h3>

      {error && (
        <div className="camera-error">
          ⚠️ {error}
        </div>
      )}

      <div className="camera-preview">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ display: isReady ? 'block' : 'none' }}
        />
        {!isReady && (
          <div className="camera-placeholder">
            <span>📷</span>
            <p>{isStarting ? '正在启动摄像头...' : '摄像头待命'}</p>
            <p className="hint">当 Bobi 需要查看时会自动启动</p>
          </div>
        )}
      </div>

      <div className="camera-info">
        <p>此摄像头同时模拟前/后两个摄像头</p>
        <p>当 Bobi 需要查看时会自动启动并抓帧</p>
      </div>

      <div className="camera-status">
        <span className={`status-dot ${isReady ? 'active' : isStarting ? 'starting' : 'standby'}`}></span>
        <span>{isReady ? '摄像头运行中' : isStarting ? '启动中...' : '待命'}</span>
      </div>
    </div>
  );
});
