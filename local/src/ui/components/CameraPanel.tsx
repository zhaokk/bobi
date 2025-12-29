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
  const [selectedImage, setSelectedImage] = useState<{ imageDataUrl: string; camera: string; ts: number } | null>(null);

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

  const captureFrame = useCallback((maxWidth = 640, quality = 0.6): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    if (cameraStatus !== 'on') return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Calculate compressed dimensions
    let width = video.videoWidth;
    let height = video.videoHeight;
    
    if (width > maxWidth) {
      const ratio = maxWidth / width;
      width = maxWidth;
      height = Math.round(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);
    
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    
    // Log compressed size for debugging
    const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
    bobiStore.log('DEBUG', 'Camera', `Frame captured: ${width}x${height}, ~${sizeKB}KB`);
    
    return dataUrl;
  }, [cameraStatus]);

  // Watch for frame requests from core
  useEffect(() => {
    const pendingRequest = bobiStore.pendingFrameRequest;
    if (!pendingRequest) return;

    const requestId = pendingRequest.requestId;
    const camera = pendingRequest.camera || 'front';
    const maxWidth = pendingRequest.maxWidth ?? 640;
    const quality = pendingRequest.quality ?? 0.6;

    // Auto-start camera if needed
    if (cameraStatus === 'off') {
      startCamera().then(() => {
        // Wait a bit for camera to stabilize
        setTimeout(() => {
          const frame = captureFrame(maxWidth, quality);
          if (frame) {
            // Save to captured images history
            bobiStore.addCapturedImage(frame, camera);
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
      const frame = captureFrame(maxWidth, quality);
      if (frame) {
        // Save to captured images history
        bobiStore.addCapturedImage(frame, camera);
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

      {/* Captured Images History */}
      {bobiStore.capturedImages.length > 0 && (
        <div className="captured-images">
          <div className="captured-images-header">
            <span>📸 已发送 ({bobiStore.capturedImages.length}/{bobiStore.maxCapturedImages})</span>
            <button 
              className="btn btn-small btn-secondary"
              onClick={() => bobiStore.clearCapturedImages()}
            >
              清空
            </button>
          </div>
          <div className="captured-images-grid">
            {bobiStore.capturedImages.slice().reverse().map((img, idx) => (
              <div 
                key={img.ts} 
                className="captured-image-item"
                onClick={() => setSelectedImage(img)}
              >
                <img src={img.imageDataUrl} alt={`capture-${idx}`} />
                <div className="captured-image-info">
                  <span className="camera-tag">{img.camera === 'front' ? '前' : '后'}</span>
                  <span className="time-tag">{new Date(img.ts).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="image-modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage.imageDataUrl} alt="captured" />
            <div className="image-modal-info">
              <span>{selectedImage.camera === 'front' ? '前摄像头' : '后摄像头'}</span>
              <span>{new Date(selectedImage.ts).toLocaleString()}</span>
            </div>
            <button className="image-modal-close" onClick={() => setSelectedImage(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
});
