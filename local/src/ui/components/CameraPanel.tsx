/**
 * Camera Panel Component
 * Auto-start camera and capture frames on request from core
 */

import { observer } from 'mobx-react-lite';
import { useRef, useEffect, useCallback, useState } from 'react';
import { bobiStore } from '../../core/store';

export const CameraPanel = observer(function CameraPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'off' | 'starting' | 'on' | 'error'>('off');
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return; // Already running
    
    setCameraStatus('starting');
    setError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment'
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setCameraStatus('on');
      bobiStore.updateCamera({ isActive: true, hasError: false });
      
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法访问摄像头';
      setError(message);
      setCameraStatus('error');
      bobiStore.updateCamera({ isActive: false, hasError: true, errorMessage: message });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus('off');
    bobiStore.updateCamera({ isActive: false });
  }, []);

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    if (cameraStatus !== 'on') return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    return canvas.toDataURL('image/jpeg', 0.8);
  }, [cameraStatus]);

  // Watch for frame requests from core
  useEffect(() => {
    const pendingRequest = bobiStore.pendingFrameRequest;
    if (!pendingRequest) return;

    const requestId = pendingRequest.requestId;
    const camera = pendingRequest.camera || 'front';

    // Auto-start camera if needed
    if (cameraStatus === 'off') {
      startCamera().then(() => {
        // Wait a bit for camera to stabilize
        setTimeout(() => {
          const frame = captureFrame();
          if (frame) {
            bobiStore.fulfillFrameRequest(requestId, {
              imageDataUrl: frame,
              camera,
              ts: Date.now(),
            });
          } else {
            bobiStore.fulfillFrameRequest(requestId, null);
          }
        }, 500);
      });
    } else if (cameraStatus === 'on') {
      const frame = captureFrame();
      if (frame) {
        bobiStore.fulfillFrameRequest(requestId, {
          imageDataUrl: frame,
          camera,
          ts: Date.now(),
        });
      } else {
        bobiStore.fulfillFrameRequest(requestId, null);
      }
    } else if (cameraStatus === 'error') {
      bobiStore.fulfillFrameRequest(requestId, null);
    }
    // 'starting' state - wait for camera to be ready
  }, [bobiStore.pendingFrameRequest, cameraStatus, captureFrame, startCamera, error]);

  // Auto-start camera when Bobi wakes up
  useEffect(() => {
    if (bobiStore.isAwake && cameraStatus === 'off') {
      startCamera();
    }
  }, [bobiStore.isAwake, startCamera, cameraStatus]);

  // Stop camera when going to sleep (optional - could keep running)
  useEffect(() => {
    if (!bobiStore.isAwake && cameraStatus === 'on') {
      // Optionally stop: stopCamera();
      // For now, keep camera running for faster subsequent captures
    }
  }, [bobiStore.isAwake, cameraStatus]);

  return (
    <div className="camera-panel">
      <h3>📷 摄像头</h3>
      
      <div className="camera-preview">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted
          className={cameraStatus === 'on' ? 'active' : ''}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        
        {cameraStatus === 'off' && (
          <div className="camera-overlay">
            <span>📷</span>
            <p>摄像头关闭</p>
          </div>
        )}
        
        {cameraStatus === 'starting' && (
          <div className="camera-overlay">
            <span className="spinner">⏳</span>
            <p>启动中...</p>
          </div>
        )}
        
        {cameraStatus === 'error' && (
          <div className="camera-overlay error">
            <span>❌</span>
            <p>{error}</p>
          </div>
        )}
      </div>
      
      <div className="camera-controls">
        <span className={`status-dot ${cameraStatus}`}></span>
        <span className="status-text">
          {cameraStatus === 'on' ? '运行中' : 
           cameraStatus === 'starting' ? '启动中...' :
           cameraStatus === 'error' ? '错误' : '关闭'}
        </span>
        <button 
          className="btn btn-small"
          onClick={cameraStatus === 'on' ? stopCamera : startCamera}
        >
          {cameraStatus === 'on' ? '停止' : '启动'}
        </button>
      </div>
    </div>
  );
});
