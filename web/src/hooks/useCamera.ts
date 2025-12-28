/**
 * Camera Hook for WebUI
 * Manages browser camera access and frame capture
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  isReady: boolean;
  isStarting: boolean;
  error: string | null;
  captureFrame: (maxWidth?: number, quality?: number) => string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  autoStartAndCapture: (maxWidth?: number, quality?: number) => Promise<string | null>;
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    if (isStarting || isReady) return;
    
    try {
      setIsStarting(true);
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment',
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsReady(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      setError(message);
      console.error('Camera error:', err);
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, isReady]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  const captureFrame = useCallback((maxWidth = 640, quality = 0.7): string | null => {
    const video = videoRef.current;
    if (!video || !isReady) return null;

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Return data URL (includes base64 prefix)
    return canvas.toDataURL('image/jpeg', quality);
  }, [isReady]);

  // Auto start camera and capture frame
  const autoStartAndCapture = useCallback(async (maxWidth = 640, quality = 0.7): Promise<string | null> => {
    // If already ready, just capture
    if (isReady && videoRef.current) {
      return captureFrame(maxWidth, quality);
    }

    // Start camera
    try {
      setIsStarting(true);
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment',
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        
        // Wait a moment for video to stabilize
        await new Promise(resolve => setTimeout(resolve, 300));
        
        setIsReady(true);
        
        // Now capture
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', quality);
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      setError(message);
      console.error('Camera error:', err);
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [isReady, captureFrame]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    isReady,
    isStarting,
    error,
    captureFrame,
    startCamera,
    stopCamera,
    autoStartAndCapture,
  };
}
